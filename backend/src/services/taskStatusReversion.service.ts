import { TaskStatus } from '@prisma/client';
import { emitErpNotification } from './erpNotification.service';
import {
  logProjectActivity,
  resolveTaskDisplayIdForTaskId,
  userShortLabel,
} from './projectActivity.service';
import { formatWorkItemRef } from '../utils/task-display-id';
import { mapEnumToFrontendTaskStatus } from '../utils/taskStatusMap';
import {
  type CurrentUser,
  userCanUnlockCompletedTask,
} from '../utils/task-permissions';
import { getSocketIo } from '../utils/socketIo';

/** Human-readable labels for assignee notifications and history. */
const STATUS_DISPLAY_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: 'Not Started',
  [TaskStatus.IN_PROGRESS]: 'In Progress',
  [TaskStatus.SUBMITTED_IN_PROGRESS]: 'Submitted-In Progress',
  [TaskStatus.COMPLETED]: 'Done',
  [TaskStatus.NOT_REQUIRED]: 'Not Required',
  [TaskStatus.ON_HOLD]: 'Suspended',
  [TaskStatus.CANCELLED]: 'Cancelled',
};

export function statusDisplayLabel(status: TaskStatus | null | undefined): string {
  if (status == null) return 'Unknown';
  return STATUS_DISPLAY_LABEL[status] ?? mapEnumToFrontendTaskStatus(status);
}

export function isTaskStatusReversion(
  previousStatus: TaskStatus | null | undefined,
  newStatus: TaskStatus | null | undefined,
): boolean {
  return (
    previousStatus === TaskStatus.COMPLETED &&
    newStatus != null &&
    newStatus !== TaskStatus.COMPLETED
  );
}

export function isTaskStatusChanged(
  previousStatus: TaskStatus | null | undefined,
  newStatus: TaskStatus | null | undefined,
): boolean {
  return (
    previousStatus != null &&
    newStatus != null &&
    previousStatus !== newStatus
  );
}

export function extractStatusReversionReason(payload: {
  statusReversionReason?: unknown;
  revertReason?: unknown;
  reopenReason?: unknown;
  statusChangeReason?: unknown;
}): string {
  const raw =
    payload.statusReversionReason ??
    payload.statusChangeReason ??
    payload.revertReason ??
    payload.reopenReason ??
    '';
  return String(raw ?? '').trim();
}

export type PmTaskStatusChangeParams = {
  projectId: string;
  taskId: string;
  taskTitle: string;
  actor: CurrentUser;
  projectCreatedById: string | null | undefined;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  assigneeUserId: string | null | undefined;
  reason: string;
};

function buildNotificationMessage(
  actorName: string,
  fromLabel: string,
  toLabel: string,
  reasonText: string,
  previousStatus: TaskStatus,
): string {
  const roleLabel = 'Project Manager';
  const base =
    previousStatus === TaskStatus.COMPLETED
      ? `${roleLabel} ${actorName} changed the task status from ${fromLabel} to ${toLabel}.`
      : `${roleLabel} ${actorName} corrected the task status and changed it from ${fromLabel} to ${toLabel}.`;
  return reasonText ? `${base} Reason: ${reasonText}` : base;
}

function buildNotificationTitle(previousStatus: TaskStatus): string {
  return previousStatus === TaskStatus.COMPLETED
    ? 'Task reopened by Project Manager'
    : 'Task status updated by Project Manager';
}

/** Log history, notify assignee, and push live update for each PM status change (with reason). */
export async function processPmTaskStatusChangeNotification(
  params: PmTaskStatusChangeParams,
): Promise<void> {
  const {
    projectId,
    taskId,
    taskTitle,
    actor,
    projectCreatedById,
    previousStatus,
    newStatus,
    assigneeUserId,
    reason,
  } = params;

  if (!isTaskStatusChanged(previousStatus, newStatus)) return;
  if (!userCanUnlockCompletedTask(actor, projectCreatedById ?? null)) return;

  const reasonText = reason.trim();
  if (!reasonText) return;

  const actorName = (await userShortLabel(actor.id)) || 'Project Manager';
  const { displayId } = await resolveTaskDisplayIdForTaskId(projectId, taskId);
  const taskRef = formatWorkItemRef(taskTitle, displayId);
  const fromLabel = statusDisplayLabel(previousStatus);
  const toLabel = statusDisplayLabel(newStatus);
  const at = new Date().toISOString();

  await logProjectActivity({
    projectId,
    actorId: actor.id,
    action: 'TASK_STATUS_CHANGED_BY_PM',
    taskId,
    summary: `${actorName} changed ${taskRef}: ${fromLabel} → ${toLabel}${
      reasonText ? ` — ${reasonText.slice(0, 200)}` : ''
    }`,
    metadata: {
      taskTitle,
      taskDisplayId: displayId ?? undefined,
      previousStatus,
      newStatus,
      previousStatusLabel: fromLabel,
      newStatusLabel: toLabel,
      statusChangeReason: reasonText,
      changedByUserId: actor.id,
      changedByName: actorName,
      changedAt: at,
      changes: [
        { field: 'status', from: fromLabel, to: toLabel },
        { field: 'statusChangeReason', from: '—', to: reasonText },
      ],
    },
  });

  if (!assigneeUserId || assigneeUserId === actor.id) return;

  const message = buildNotificationMessage(
    actorName,
    fromLabel,
    toLabel,
    reasonText,
    previousStatus,
  );

  const payload = {
    id: `task-status-${taskId}-${Date.now()}`,
    type: 'TASK_STATUS_REVERTED',
    title: buildNotificationTitle(previousStatus),
    message,
    read: false,
    createdAt: at,
    projectId,
    taskId,
    reversionReason: reasonText,
    previousStatus: fromLabel,
    newStatus: toLabel,
    reopenedByName: actorName,
  };

  emitErpNotification(assigneeUserId, payload);

  const io = getSocketIo();
  if (io) {
    io.to(`user:${assigneeUserId}`).emit('erp:task-status-reverted', {
      projectId,
      taskId,
      newStatus: toLabel,
      newStatusValue: mapEnumToFrontendTaskStatus(newStatus),
      previousStatus: fromLabel,
      reversionReason: reasonText,
      reopenedByName: actorName,
      reopenedAt: at,
    });
  }
}

/** @deprecated Use processPmTaskStatusChangeNotification */
export const processTaskStatusReversion = processPmTaskStatusChangeNotification;

export type TaskStatusReversionParams = PmTaskStatusChangeParams;
