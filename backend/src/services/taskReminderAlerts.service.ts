import prisma from '../config/database';
import { getSocketIo } from '../utils/socketIo';
import { buildTaskReminderClientPayload } from '../utils/taskReminderPayload';

/** Escalation thresholds (mission-critical alarm behaviour). */
const ESCALATE_PRIORITY_MS = 5 * 60 * 1000; // 5 min ignored -> raise priority + flash tab
const NOTIFY_MANAGER_MS = 15 * 60 * 1000; // 15 min ignored -> notify managers + log ignored

export const ALERT_STATUS = {
  PENDING: 'PENDING',
  SNOOZED: 'SNOOZED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  COMPLETED: 'COMPLETED',
} as const;

export const ALERT_PRIORITY = {
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

const PRIORITY_RANK: Record<string, number> = { NORMAL: 0, HIGH: 1, CRITICAL: 2 };

type ReminderWithTask = {
  id: string;
  taskId: string;
  frequency: string;
  hour: number;
  minute: number;
  description: string | null;
  createdBy?: string | null;
  task: {
    id: string;
    title: string;
    project: { id: string; name: string; referenceNumber: string | null };
  };
};

type AlertRow = {
  id: string;
  reminderId: string;
  taskId: string;
  userId: string;
  status: string;
  priority: string;
  dueAt: Date;
  firedAt: Date;
  lastFiredAt: Date;
  snoozeCount: number;
  snoozedUntil: Date | null;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  completedAt: Date | null;
  escalatedAt: Date | null;
  managerNotifiedAt: Date | null;
};

async function writeActionLog(entry: {
  alertId?: string | null;
  reminderId?: string | null;
  taskId?: string | null;
  actorId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.taskReminderActionLog.create({
      data: {
        alertId: entry.alertId ?? null,
        reminderId: entry.reminderId ?? null,
        taskId: entry.taskId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        metadata: (entry.metadata as any) ?? undefined,
      },
    });
  } catch (err) {
    console.error('[reminder-alarm] failed to write audit log', entry.action, err);
  }
}

export function buildAlertClientPayload(alert: AlertRow, reminder: ReminderWithTask) {
  const base = buildTaskReminderClientPayload({
    id: reminder.id,
    taskId: reminder.taskId,
    frequency: reminder.frequency,
    hour: reminder.hour,
    minute: reminder.minute,
    description: reminder.description,
    task: reminder.task,
    sentAt: alert.lastFiredAt,
  });
  return {
    ...base,
    alertId: alert.id,
    status: alert.status,
    priority: alert.priority,
    dueAt: alert.dueAt.toISOString(),
    firedAt: alert.firedAt.toISOString(),
    lastFiredAt: alert.lastFiredAt.toISOString(),
    snoozeCount: alert.snoozeCount,
    snoozedUntil: alert.snoozedUntil ? alert.snoozedUntil.toISOString() : null,
    escalated: !!alert.escalatedAt,
  };
}

function emitToUser(userId: string, event: string, payload: unknown): void {
  const io = getSocketIo();
  io?.to(`user:${userId}`).emit(event, payload);
}

/**
 * Create (or re-fire) one alarm alert per notify user when a reminder becomes due.
 * Called from the reminder scheduler on every delivery.
 */
export async function fireAlertsForReminder(
  reminder: ReminderWithTask,
  userIds: string[],
  dueAt: Date,
): Promise<void> {
  for (const userId of userIds) {
    try {
      const existing = await prisma.taskReminderAlert.findFirst({
        where: {
          reminderId: reminder.id,
          userId,
          status: { in: [ALERT_STATUS.PENDING, ALERT_STATUS.SNOOZED] },
        },
      });

      let alert: AlertRow;
      if (existing) {
        alert = (await prisma.taskReminderAlert.update({
          where: { id: existing.id },
          data: {
            status: ALERT_STATUS.PENDING,
            lastFiredAt: dueAt,
            snoozedUntil: null,
            escalatedAt: null,
            managerNotifiedAt: null,
          },
        })) as AlertRow;
        await writeActionLog({
          alertId: alert.id,
          reminderId: reminder.id,
          taskId: reminder.taskId,
          action: 'REFIRED',
          metadata: { userId },
        });
      } else {
        alert = (await prisma.taskReminderAlert.create({
          data: {
            reminderId: reminder.id,
            taskId: reminder.taskId,
            userId,
            status: ALERT_STATUS.PENDING,
            priority: ALERT_PRIORITY.NORMAL,
            dueAt,
            firedAt: dueAt,
            lastFiredAt: dueAt,
          },
        })) as AlertRow;
        await writeActionLog({
          alertId: alert.id,
          reminderId: reminder.id,
          taskId: reminder.taskId,
          action: 'FIRED',
          metadata: { userId },
        });
      }

      emitToUser(userId, 'task:reminder-alarm', buildAlertClientPayload(alert, reminder));
    } catch (err) {
      console.error('[reminder-alarm] failed to fire alert', reminder.id, userId, err);
    }
  }
}

const reminderInclude = {
  reminder: {
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true, referenceNumber: true } },
        },
      },
    },
  },
} as const;

/** Active (pending) alarms for a user — used by popup on login/refresh. */
export async function getActiveAlertsForUser(userId: string) {
  const rows = await prisma.taskReminderAlert.findMany({
    where: { userId, status: ALERT_STATUS.PENDING },
    include: reminderInclude,
    orderBy: [{ lastFiredAt: 'asc' }],
    take: 50,
  });

  return rows
    .filter((r) => r.reminder?.task)
    .map((r) => buildAlertClientPayload(r as any, r.reminder as any))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
        new Date(a.lastFiredAt).getTime() - new Date(b.lastFiredAt).getTime(),
    );
}

async function loadAlertForAction(alertId: string) {
  return prisma.taskReminderAlert.findUnique({
    where: { id: alertId },
    include: reminderInclude,
  });
}

function canActOnAlert(alert: { userId: string }, user: { id: string; role?: string }): boolean {
  if (alert.userId === user.id) return true;
  const role = String(user.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

type ActionResult =
  | { ok: true; payload: ReturnType<typeof buildAlertClientPayload> }
  | { ok: false; code: number; message: string };

export async function acknowledgeAlert(
  alertId: string,
  user: { id: string; role?: string },
): Promise<ActionResult> {
  const alert = await loadAlertForAction(alertId);
  if (!alert || !alert.reminder?.task) {
    return { ok: false, code: 404, message: 'Reminder alert not found' };
  }
  if (!canActOnAlert(alert, user)) {
    return { ok: false, code: 403, message: 'Access denied' };
  }
  if (alert.status === ALERT_STATUS.ACKNOWLEDGED || alert.status === ALERT_STATUS.COMPLETED) {
    return { ok: true, payload: buildAlertClientPayload(alert as any, alert.reminder as any) };
  }

  const now = new Date();
  const updated = await prisma.taskReminderAlert.update({
    where: { id: alert.id },
    data: {
      status: ALERT_STATUS.ACKNOWLEDGED,
      acknowledgedById: user.id,
      acknowledgedAt: now,
      snoozedUntil: null,
    },
  });
  await writeActionLog({
    alertId: alert.id,
    reminderId: alert.reminderId,
    taskId: alert.taskId,
    actorId: user.id,
    action: 'ACKNOWLEDGED',
  });

  const payload = buildAlertClientPayload(updated as any, alert.reminder as any);
  emitToUser(alert.userId, 'task:reminder-alarm-update', payload);
  return { ok: true, payload };
}

export async function snoozeAlert(
  alertId: string,
  user: { id: string; role?: string },
  minutes: number,
): Promise<ActionResult> {
  const alert = await loadAlertForAction(alertId);
  if (!alert || !alert.reminder?.task) {
    return { ok: false, code: 404, message: 'Reminder alert not found' };
  }
  if (!canActOnAlert(alert, user)) {
    return { ok: false, code: 403, message: 'Access denied' };
  }
  if (alert.status === ALERT_STATUS.COMPLETED) {
    return { ok: false, code: 400, message: 'Reminder already completed' };
  }

  const mins = Math.min(120, Math.max(1, Math.round(Number(minutes) || 5)));
  const until = new Date(Date.now() + mins * 60 * 1000);
  const updated = await prisma.taskReminderAlert.update({
    where: { id: alert.id },
    data: {
      status: ALERT_STATUS.SNOOZED,
      snoozedUntil: until,
      snoozeCount: { increment: 1 },
    },
  });
  await writeActionLog({
    alertId: alert.id,
    reminderId: alert.reminderId,
    taskId: alert.taskId,
    actorId: user.id,
    action: 'SNOOZED',
    metadata: { minutes: mins, snoozedUntil: until.toISOString() },
  });

  const payload = buildAlertClientPayload(updated as any, alert.reminder as any);
  emitToUser(alert.userId, 'task:reminder-alarm-update', payload);
  return { ok: true, payload };
}

export async function completeAlert(
  alertId: string,
  user: { id: string; role?: string },
): Promise<ActionResult> {
  const alert = await loadAlertForAction(alertId);
  if (!alert || !alert.reminder?.task) {
    return { ok: false, code: 404, message: 'Reminder alert not found' };
  }
  if (!canActOnAlert(alert, user)) {
    return { ok: false, code: 403, message: 'Access denied' };
  }

  const now = new Date();
  const updated = await prisma.taskReminderAlert.update({
    where: { id: alert.id },
    data: {
      status: ALERT_STATUS.COMPLETED,
      completedAt: now,
      acknowledgedById: alert.acknowledgedById || user.id,
      acknowledgedAt: alert.acknowledgedAt || now,
      snoozedUntil: null,
    },
  });
  await writeActionLog({
    alertId: alert.id,
    reminderId: alert.reminderId,
    taskId: alert.taskId,
    actorId: user.id,
    action: 'COMPLETED',
  });

  const payload = buildAlertClientPayload(updated as any, alert.reminder as any);
  emitToUser(alert.userId, 'task:reminder-alarm-update', payload);
  return { ok: true, payload };
}

/** Audit trail for one alert (owner / admins). */
export async function getAlertActionLogs(alertId: string, user: { id: string; role?: string }) {
  const alert = await prisma.taskReminderAlert.findUnique({ where: { id: alertId } });
  if (!alert) return { ok: false as const, code: 404, message: 'Reminder alert not found' };
  if (!canActOnAlert(alert, user)) return { ok: false as const, code: 403, message: 'Access denied' };

  const logs = await prisma.taskReminderActionLog.findMany({
    where: { alertId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return { ok: true as const, logs };
}

async function findManagerUserIds(excludeUserId: string, reminderCreatedBy?: string | null): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] as any }, isActive: true },
    select: { id: true },
  });
  const ids = new Set<string>(admins.map((u) => u.id));
  if (reminderCreatedBy) ids.add(reminderCreatedBy);
  ids.delete(excludeUserId);
  return [...ids];
}

/**
 * Periodic escalation pass, invoked from the reminder scheduler tick:
 *  - re-fires snoozed alarms whose snooze expired
 *  - after 5 min ignored: raises priority to HIGH (client flashes tab + louder alarm)
 *  - after 15 min ignored: raises priority to CRITICAL, notifies managers, logs as ignored
 */
export async function processAlertEscalations(now: Date = new Date()): Promise<void> {
  // 1) Snooze expired -> re-fire alarm
  try {
    const expired = await prisma.taskReminderAlert.findMany({
      where: { status: ALERT_STATUS.SNOOZED, snoozedUntil: { lte: now } },
      include: reminderInclude,
      take: 100,
    });
    for (const row of expired) {
      if (!row.reminder?.task) continue;
      const updated = await prisma.taskReminderAlert.update({
        where: { id: row.id },
        data: {
          status: ALERT_STATUS.PENDING,
          lastFiredAt: now,
          snoozedUntil: null,
          escalatedAt: null,
          managerNotifiedAt: null,
        },
      });
      await writeActionLog({
        alertId: row.id,
        reminderId: row.reminderId,
        taskId: row.taskId,
        action: 'REFIRED',
        metadata: { reason: 'SNOOZE_EXPIRED', snoozeCount: row.snoozeCount },
      });
      emitToUser(row.userId, 'task:reminder-alarm', buildAlertClientPayload(updated as any, row.reminder as any));
    }
  } catch (err) {
    console.error('[reminder-alarm] snooze re-fire pass failed', err);
  }

  // 2) Ignored 5 minutes -> escalate priority
  try {
    const toEscalate = await prisma.taskReminderAlert.findMany({
      where: {
        status: ALERT_STATUS.PENDING,
        escalatedAt: null,
        lastFiredAt: { lte: new Date(now.getTime() - ESCALATE_PRIORITY_MS) },
      },
      include: reminderInclude,
      take: 100,
    });
    for (const row of toEscalate) {
      if (!row.reminder?.task) continue;
      const updated = await prisma.taskReminderAlert.update({
        where: { id: row.id },
        data: { priority: ALERT_PRIORITY.HIGH, escalatedAt: now },
      });
      await writeActionLog({
        alertId: row.id,
        reminderId: row.reminderId,
        taskId: row.taskId,
        action: 'PRIORITY_ESCALATED',
        metadata: { from: row.priority, to: ALERT_PRIORITY.HIGH, ignoredForMs: ESCALATE_PRIORITY_MS },
      });
      emitToUser(
        row.userId,
        'task:reminder-alarm-escalated',
        buildAlertClientPayload(updated as any, row.reminder as any),
      );
    }
  } catch (err) {
    console.error('[reminder-alarm] priority escalation pass failed', err);
  }

  // 3) Ignored 15 minutes -> notify managers + log as ignored
  try {
    const toNotify = await prisma.taskReminderAlert.findMany({
      where: {
        status: ALERT_STATUS.PENDING,
        managerNotifiedAt: null,
        lastFiredAt: { lte: new Date(now.getTime() - NOTIFY_MANAGER_MS) },
      },
      include: reminderInclude,
      take: 100,
    });
    for (const row of toNotify) {
      if (!row.reminder?.task) continue;
      const updated = await prisma.taskReminderAlert.update({
        where: { id: row.id },
        data: {
          priority: ALERT_PRIORITY.CRITICAL,
          managerNotifiedAt: now,
          ignoredLoggedAt: now,
        },
      });

      const ignoredUser = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const managerIds = await findManagerUserIds(row.userId, row.reminder.createdBy);
      const alertPayload = buildAlertClientPayload(updated as any, row.reminder as any);
      const managerPayload = {
        ...alertPayload,
        ignoredBy: ignoredUser
          ? {
              id: ignoredUser.id,
              name: `${ignoredUser.firstName || ''} ${ignoredUser.lastName || ''}`.trim() || ignoredUser.email,
            }
          : { id: row.userId, name: 'Unknown user' },
        ignoredForMinutes: Math.round(NOTIFY_MANAGER_MS / 60000),
      };
      for (const managerId of managerIds) {
        emitToUser(managerId, 'task:reminder-ignored', managerPayload);
      }

      await writeActionLog({
        alertId: row.id,
        reminderId: row.reminderId,
        taskId: row.taskId,
        action: 'MANAGER_NOTIFIED',
        metadata: { managerIds, ignoredUserId: row.userId },
      });
      await writeActionLog({
        alertId: row.id,
        reminderId: row.reminderId,
        taskId: row.taskId,
        action: 'IGNORED_LOGGED',
        metadata: { ignoredForMs: NOTIFY_MANAGER_MS },
      });

      // Keep alarming the original user at CRITICAL priority
      emitToUser(row.userId, 'task:reminder-alarm-escalated', alertPayload);
    }
  } catch (err) {
    console.error('[reminder-alarm] manager notification pass failed', err);
  }
}
