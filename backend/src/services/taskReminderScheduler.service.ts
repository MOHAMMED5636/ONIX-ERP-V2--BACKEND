import prisma from '../config/database';
import { getSocketIo } from '../utils/socketIo';

import { buildTaskReminderClientPayload } from '../utils/taskReminderPayload';
import { fireAlertsForReminder, processAlertEscalations } from './taskReminderAlerts.service';

export const REMINDER_TZ = process.env.REMINDER_TZ || 'Asia/Dubai';

/** Set TASK_REMINDERS_ENABLED=false in .env to stop all task reminder firing. */
export function taskRemindersEnabled(): boolean {
  return process.env.TASK_REMINDERS_ENABLED !== 'false';
}

export async function disableAllTaskReminders(): Promise<{ remindersDisabled: number; alertsClosed: number }> {
  const remindersDisabled = await prisma.taskReminder.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  const alertsClosed = await prisma.taskReminderAlert.updateMany({
    where: { status: { in: ['PENDING', 'SNOOZED'] } },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return { remindersDisabled: remindersDisabled.count, alertsClosed: alertsClosed.count };
}
const CHECK_INTERVAL_MS = 15_000;
const GRACE_MINUTES_AFTER = 3;

type Parts = {
  ymd: string;
  hour: number;
  minute: number;
  weekday: number;
};

function getZonedParts(date: Date): Parts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: REMINDER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const y = pick('year');
  const m = pick('month');
  const d = pick('day');
  let hour = Number(pick('hour')) || 0;
  if (hour === 24) hour = 0;
  const minute = Number(pick('minute')) || 0;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = wdMap[pick('weekday')] ?? 0;
  return { ymd: `${y}-${m}-${d}`, hour, minute, weekday };
}

function ymdInTz(date: Date): string {
  return getZonedParts(date).ymd;
}

function weekdayInTz(date: Date): number {
  return getZonedParts(date).weekday;
}

/** Only cancelled tasks skip reminders — completed tasks can still notify (e.g. follow-ups). */
function isTaskCancelled(status: string): boolean {
  return String(status || '').toUpperCase() === 'CANCELLED';
}

function anchorDate(reminder: { triggerType: string; specificDate: Date | null }, task: { dueDate: Date | null }): Date | null {
  if (reminder.triggerType === 'SPECIFIC_DATE' && reminder.specificDate) {
    return reminder.specificDate;
  }
  return task.dueDate || null;
}

function isTriggerWindowActive(
  reminder: { triggerType: string; specificDate: Date | null; frequency: string },
  task: { dueDate: Date | null; status: string },
  now: Date,
  ymd: string,
): boolean {
  if (isTaskCancelled(task.status)) return false;

  const anchor = anchorDate(reminder, task);
  const anchorYmd = anchor ? ymdInTz(anchor) : null;
  const freq = String(reminder.frequency || 'DAILY').toUpperCase();

  if (freq === 'ONCE') {
    if (!anchorYmd) return true;
    return ymd === anchorYmd;
  }

  if (freq === 'WEEKLY') {
    if (!anchor) return false;
    if (ymd < (anchorYmd || ymd)) return false;
    return weekdayInTz(now) === weekdayInTz(anchor);
  }

  // DAILY
  if (reminder.triggerType === 'SPECIFIC_DATE' && anchorYmd) {
    return ymd >= anchorYmd;
  }
  if (reminder.triggerType === 'DUE_DATE' && anchorYmd) {
    return ymd <= anchorYmd;
  }
  return true;
}

function shouldSendNow(
  reminder: {
    hour: number;
    minute: number;
    frequency: string;
    lastSentAt: Date | null;
    triggerType: string;
    specificDate: Date | null;
  },
  task: { dueDate: Date | null; status: string },
  now: Date,
  parts: Parts,
): boolean {
  if (parts.hour !== reminder.hour || parts.minute !== reminder.minute) {
    return false;
  }

  if (!isTriggerWindowActive(reminder, task, now, parts.ymd)) {
    return false;
  }

  const freq = String(reminder.frequency || 'DAILY').toUpperCase();
  const last = reminder.lastSentAt;

  if (freq === 'ONCE') {
    return !last;
  }

  if (freq === 'DAILY') {
    if (!last) return true;
    return ymdInTz(last) !== parts.ymd;
  }

  if (freq === 'WEEKLY') {
    if (!last) return true;
    const lastYmd = ymdInTz(last);
    if (lastYmd === parts.ymd) return false;
    return weekdayInTz(last) !== parts.weekday || parts.ymd > lastYmd;
  }

  return false;
}

async function deliverReminder(
  reminder: {
    id: string;
    taskId: string;
    frequency: string;
    hour: number;
    minute: number;
    description: string | null;
    notifyUserIds: string[];
    triggerType: string;
    specificDate: Date | null;
    task: {
      id: string;
      title: string;
      status: string;
      dueDate: Date | null;
      project: { id: string; name: string; referenceNumber: string | null };
    };
  },
): Promise<void> {
  if (!taskRemindersEnabled()) return;

  const io = getSocketIo();
  const sentAt = new Date();
  const payload = buildTaskReminderClientPayload({ ...reminder, sentAt });
  const validUserIds = await resolveNotifyUserIds(reminder.notifyUserIds);

  for (const userId of validUserIds) {
    io?.to(`user:${userId}`).emit('task:reminder', payload);
  }

  // Critical alarm system: create per-user alarm alerts that loop until acted on.
  await fireAlertsForReminder(reminder as any, validUserIds, sentAt);

  await prisma.taskReminder.update({
    where: { id: reminder.id },
    data: { lastSentAt: sentAt },
  });

  console.log(
    `[task-reminder] Sent "${payload.taskName}" to ${validUserIds.length} user(s) (${payload.summary}, tz=${REMINDER_TZ})`,
  );
}

async function resolveNotifyUserIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const found = new Set(users.map((u) => u.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length) {
    console.warn('[task-reminder] Skipping unknown notify user ids:', missing.join(', '));
  }
  return unique.filter((id) => found.has(id));
}

/** Run due checks for one user (called from inbox poll so open browsers still get reminders). */
export async function processDueRemindersForUser(userId: string): Promise<number> {
  if (!taskRemindersEnabled()) return 0;
  const now = new Date();
  const parts = getZonedParts(now);
  const rows = await prisma.taskReminder.findMany({
    where: { isActive: true, notifyUserIds: { has: userId } },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: {
            select: { id: true, name: true, referenceNumber: true },
          },
        },
      },
    },
  });

  let sent = 0;
  for (const row of rows) {
    if (!row.task) continue;
    try {
      if (shouldSendNow(row, row.task, now, parts)) {
        await deliverReminder(row as any);
        sent += 1;
      }
    } catch (err) {
      console.error('[task-reminder] user poll delivery failed', row.taskId, err);
    }
  }
  return sent;
}

async function tickReminders(): Promise<void> {
  if (!taskRemindersEnabled()) return;
  const now = new Date();
  const parts = getZonedParts(now);

  const reminders = await prisma.taskReminder.findMany({
    where: { isActive: true },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: {
            select: { id: true, name: true, referenceNumber: true },
          },
        },
      },
    },
  });

  for (const row of reminders) {
    if (!row.task || !row.notifyUserIds?.length) continue;
    try {
      if (shouldSendNow(row, row.task, now, parts)) {
        await deliverReminder(row as any);
      }
    } catch (err) {
      console.error('[task-reminder] delivery failed', row.taskId, err);
    }
  }

  // Escalation pass: snooze re-fires, 5-min priority bump, 15-min manager notify.
  await processAlertEscalations(now).catch((err) => {
    console.error('[reminder-alarm] escalation pass failed', err);
  });
}

/** Manual / script trigger — deliver if due now (used by test endpoint). */
export async function triggerReminderNow(taskId: string): Promise<boolean> {
  const now = new Date();
  const parts = getZonedParts(now);
  const row = await prisma.taskReminder.findFirst({
    where: { taskId, isActive: true },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: { select: { id: true, name: true, referenceNumber: true } },
        },
      },
    },
  });
  if (!row?.task) return false;
  if (!shouldSendNow(row, row.task, now, parts)) return false;
  await deliverReminder(row as any);
  return true;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startTaskReminderScheduler(): void {
  if (!taskRemindersEnabled()) {
    console.log('[task-reminder] Scheduler disabled (TASK_REMINDERS_ENABLED=false)');
    return;
  }
  if (intervalId) return;
  console.log(`[task-reminder] Scheduler started (tz=${REMINDER_TZ}, check every 15s)`);
  void tickReminders();
  intervalId = setInterval(() => {
    void tickReminders();
  }, CHECK_INTERVAL_MS);
}

export function stopTaskReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
