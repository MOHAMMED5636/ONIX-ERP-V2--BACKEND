import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { computeTaskPermissions } from '../utils/task-permissions';
import {
  isProjectWriteLockedForUser,
  PROJECT_SUSPENDED_MESSAGE,
} from '../utils/project-suspension';
import { buildTaskReminderClientPayload } from '../utils/taskReminderPayload';
import {
  REMINDER_TZ,
  processDueRemindersForUser,
  taskRemindersEnabled,
  disableAllTaskReminders,
} from '../services/taskReminderScheduler.service';
import {
  acknowledgeAlert,
  completeAlert,
  getActiveAlertsForUser,
  getAlertActionLogs,
  snoozeAlert,
} from '../services/taskReminderAlerts.service';

function formatReminderResponse(row: {
  id: string;
  taskId: string;
  triggerType: string;
  specificDate: Date | null;
  frequency: string;
  hour: number;
  minute: number;
  notifyUserIds: string[];
  description: string | null;
  isActive: boolean;
}) {
  const h12 = row.hour % 12 || 12;
  const ampm = row.hour >= 12 ? 'pm' : 'am';
  const min = String(row.minute).padStart(2, '0');
  const freqLabel =
    row.frequency === 'WEEKLY' ? 'Weekly' : row.frequency === 'ONCE' ? 'Once' : 'Daily';
  const summary = row.isActive ? `${freqLabel} at ${h12}:${min} ${ampm}` : null;

  return {
    id: row.id,
    taskId: row.taskId,
    triggerType: row.triggerType,
    specificDate: row.specificDate ? row.specificDate.toISOString() : null,
    frequency: row.frequency,
    hour: row.hour,
    minute: row.minute,
    notifyUserIds: row.notifyUserIds || [],
    description: row.description?.trim() || null,
    isActive: row.isActive,
    summary,
  };
}

async function loadTaskForReminder(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { createdBy: true, status: true } },
      assignments: { select: { employeeId: true } },
      delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
    },
  });
}

function canManageReminder(req: AuthRequest, task: NonNullable<Awaited<ReturnType<typeof loadTaskForReminder>>>) {
  if (!req.user) return false;
  if (
    isProjectWriteLockedForUser({
      projectStatus: task.project?.status ?? null,
      projectCreatedById: task.project?.createdBy ?? null,
      user: req.user,
    })
  ) {
    return false;
  }
  const perms = computeTaskPermissions({
    user: { id: req.user.id, role: req.user.role as any },
    task,
    projectCreatedById: task.project?.createdBy ?? null,
    projectStatus: task.project?.status ?? null,
  });
  return perms.canEditMainFields || perms.canEditAssigneeFields;
}

export const getTaskReminder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const task = await loadTaskForReminder(taskId);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    if (!canManageReminder(req, task)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const reminder = await prisma.taskReminder.findUnique({ where: { taskId } });
    res.json({
      success: true,
      data: reminder ? formatReminderResponse(reminder) : null,
    });
  } catch (err) {
    console.error('getTaskReminder', err);
    res.status(500).json({ success: false, message: 'Failed to load reminder' });
  }
};

export const upsertTaskReminder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!taskRemindersEnabled()) {
      res.status(403).json({ success: false, message: 'Task reminders are disabled system-wide' });
      return;
    }
    const { taskId } = req.params;
    const {
      triggerType = 'DUE_DATE',
      specificDate,
      frequency = 'DAILY',
      hour = 8,
      minute = 0,
      notifyUserIds = [],
      description,
    } = req.body || {};

    const task = await loadTaskForReminder(taskId);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (
      isProjectWriteLockedForUser({
        projectStatus: task.project?.status ?? null,
        projectCreatedById: task.project?.createdBy ?? null,
        user: req.user,
      })
    ) {
      res.status(423).json({
        success: false,
        message: PROJECT_SUSPENDED_MESSAGE,
        code: 'PROJECT_SUSPENDED',
      });
      return;
    }
    if (!canManageReminder(req, task)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const trig = String(triggerType).toUpperCase() === 'SPECIFIC_DATE' ? 'SPECIFIC_DATE' : 'DUE_DATE';
    const freqRaw = String(frequency).toUpperCase();
    const freq = ['ONCE', 'WEEKLY', 'DAILY'].includes(freqRaw) ? freqRaw : 'DAILY';
    const h = Math.min(23, Math.max(0, Number(hour) || 0));
    const m = Math.min(59, Math.max(0, Number(minute) || 0));
    const ids = Array.isArray(notifyUserIds)
      ? notifyUserIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (!ids.length) {
      res.status(400).json({ success: false, message: 'Select at least one person to notify' });
      return;
    }

    let parsedSpecific: Date | null = null;
    if (trig === 'SPECIFIC_DATE') {
      if (!specificDate) {
        res.status(400).json({ success: false, message: 'Specific date is required' });
        return;
      }
      parsedSpecific = new Date(specificDate);
      if (Number.isNaN(parsedSpecific.getTime())) {
        res.status(400).json({ success: false, message: 'Invalid specific date' });
        return;
      }
    }

    const desc =
      description != null && String(description).trim() !== ''
        ? String(description).trim().slice(0, 2000)
        : null;

    const reminder = await prisma.taskReminder.upsert({
      where: { taskId },
      create: {
        taskId,
        triggerType: trig,
        specificDate: parsedSpecific,
        frequency: freq,
        hour: h,
        minute: m,
        notifyUserIds: ids,
        description: desc,
        isActive: true,
        createdBy: req.user.id,
      },
      update: {
        triggerType: trig,
        specificDate: parsedSpecific,
        frequency: freq,
        hour: h,
        minute: m,
        notifyUserIds: ids,
        description: desc,
        isActive: true,
        lastSentAt: null,
      },
    });

    res.json({ success: true, data: formatReminderResponse(reminder) });
  } catch (err) {
    console.error('upsertTaskReminder', err);
    res.status(500).json({ success: false, message: 'Failed to save reminder' });
  }
};

/** Recent reminder deliveries for the logged-in user (polling fallback when socket is offline). */
export const getMyReminderInbox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!taskRemindersEnabled()) {
      res.json({ success: true, data: [], timezone: REMINDER_TZ, enabled: false });
      return;
    }

    await processDueRemindersForUser(req.user.id);

    const since = new Date(Date.now() - 10 * 60 * 1000);
    const rows = await prisma.taskReminder.findMany({
      where: {
        isActive: true,
        notifyUserIds: { has: req.user.id },
        lastSentAt: { gte: since },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            project: { select: { id: true, name: true, referenceNumber: true } },
          },
        },
      },
      orderBy: { lastSentAt: 'desc' },
      take: 20,
    });

    const data = rows
      .filter((r) => r.task)
      .map((r) =>
        buildTaskReminderClientPayload({
          id: r.id,
          taskId: r.taskId,
          frequency: r.frequency,
          hour: r.hour,
          minute: r.minute,
          description: r.description,
          task: r.task as any,
          sentAt: r.lastSentAt,
        }),
      );

    res.json({ success: true, data, timezone: REMINDER_TZ });
  } catch (err) {
    console.error('getMyReminderInbox', err);
    res.status(500).json({ success: false, message: 'Failed to load reminder notifications' });
  }
};

/** Active (un-acknowledged) critical alarm alerts for the logged-in user. */
export const getMyActiveReminderAlerts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!taskRemindersEnabled()) {
      res.json({ success: true, data: [], enabled: false });
      return;
    }
    // Trigger due checks first so a freshly-due reminder appears immediately on poll.
    await processDueRemindersForUser(req.user.id).catch(() => {});
    const data = await getActiveAlertsForUser(req.user.id);
    res.json({ success: true, data, timezone: REMINDER_TZ });
  } catch (err) {
    console.error('getMyActiveReminderAlerts', err);
    res.status(500).json({ success: false, message: 'Failed to load reminder alarms' });
  }
};

export const acknowledgeReminderAlert = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const result = await acknowledgeAlert(req.params.alertId, {
      id: req.user.id,
      role: req.user.role as any,
    });
    if (!result.ok) {
      res.status(result.code).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, data: result.payload });
  } catch (err) {
    console.error('acknowledgeReminderAlert', err);
    res.status(500).json({ success: false, message: 'Failed to acknowledge reminder' });
  }
};

export const snoozeReminderAlert = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const minutes = Number(req.body?.minutes) || 5;
    const result = await snoozeAlert(
      req.params.alertId,
      { id: req.user.id, role: req.user.role as any },
      minutes,
    );
    if (!result.ok) {
      res.status(result.code).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, data: result.payload });
  } catch (err) {
    console.error('snoozeReminderAlert', err);
    res.status(500).json({ success: false, message: 'Failed to snooze reminder' });
  }
};

export const completeReminderAlert = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const result = await completeAlert(req.params.alertId, {
      id: req.user.id,
      role: req.user.role as any,
    });
    if (!result.ok) {
      res.status(result.code).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, data: result.payload });
  } catch (err) {
    console.error('completeReminderAlert', err);
    res.status(500).json({ success: false, message: 'Failed to complete reminder' });
  }
};

/** Audit trail of one alarm alert (owner or admin). */
export const getReminderAlertLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const result = await getAlertActionLogs(req.params.alertId, {
      id: req.user.id,
      role: req.user.role as any,
    });
    if (!result.ok) {
      res.status(result.code).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, data: result.logs });
  } catch (err) {
    console.error('getReminderAlertLogs', err);
    res.status(500).json({ success: false, message: 'Failed to load reminder audit log' });
  }
};

export const deleteTaskReminder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const task = await loadTaskForReminder(taskId);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    if (!canManageReminder(req, task)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await prisma.taskReminder.deleteMany({ where: { taskId } });
    res.json({ success: true, data: null });
  } catch (err) {
    console.error('deleteTaskReminder', err);
    res.status(500).json({ success: false, message: 'Failed to remove reminder' });
  }
};

export const getReminderConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, enabled: taskRemindersEnabled(), timezone: REMINDER_TZ });
};

export const disableAllReminders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const role = String(req.user.role || '').toUpperCase();
    if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const result = await disableAllTaskReminders();
    res.json({
      success: true,
      message: 'All task reminders have been turned off',
      ...result,
    });
  } catch (err) {
    console.error('disableAllReminders', err);
    res.status(500).json({ success: false, message: 'Failed to disable reminders' });
  }
};
