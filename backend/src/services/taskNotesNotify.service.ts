import prisma from '../config/database';
import { emitErpNotification } from './erpNotification.service';
import { fetchProjectChatParticipants } from './projectChatParticipants.service';
import {
  logProjectActivity,
  resolveTaskDisplayIdForTaskId,
  userShortLabel,
} from './projectActivity.service';
import { formatWorkItemRef } from '../utils/task-display-id';
import { getSocketIo } from '../utils/socketIo';
import { buildTasksDeepLink, sendBrowserPushToUsers } from './browserPush.service';

export function normalizeNotesValue(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function hasNotesFieldChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  return normalizeNotesValue(previous) !== normalizeNotesValue(next);
}

const FIELD_LABEL = {
  remarks: 'Remarks',
  assigneeNotes: 'Assignee notes',
} as const;

export type TaskNotesField = keyof typeof FIELD_LABEL;

export async function processTaskNotesChangeNotification(params: {
  projectId: string;
  projectName?: string | null;
  projectReferenceNumber?: string | null;
  taskId: string;
  taskTitle: string;
  field: TaskNotesField;
  actorId: string;
  previousValue?: string | null;
  newValue?: string | null;
}): Promise<void> {
  const { projectId, taskId, field, actorId } = params;
  if (!actorId || !projectId || !taskId) return;
  if (!hasNotesFieldChange(params.previousValue, params.newValue)) return;

  const project =
    params.projectName != null
      ? {
          name: params.projectName,
          referenceNumber: params.projectReferenceNumber ?? null,
        }
      : await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true, referenceNumber: true },
        });

  const projectName = project?.name || 'Project';
  const projectReferenceNumber = project?.referenceNumber ?? null;
  const actorName = (await userShortLabel(actorId)) || 'Someone';
  const { displayId } = await resolveTaskDisplayIdForTaskId(projectId, taskId);
  const taskRef = formatWorkItemRef(params.taskTitle, displayId);
  const fieldLabel = FIELD_LABEL[field];
  const newText = normalizeNotesValue(params.newValue);
  const preview = newText.length > 200 ? `${newText.slice(0, 197)}...` : newText;
  const at = new Date().toISOString();
  const projectLabel = projectReferenceNumber || projectName;

  const message = preview
    ? `${actorName} updated ${fieldLabel} on ${taskRef}: "${preview}"`
    : `${actorName} cleared ${fieldLabel} on ${taskRef}.`;

  const title =
    field === 'remarks'
      ? `Remarks updated — ${projectLabel}`
      : `Assignee notes updated — ${projectLabel}`;

  const notifType =
    field === 'remarks' ? 'TASK_REMARKS_UPDATED' : 'TASK_ASSIGNEE_NOTES_UPDATED';

  await logProjectActivity({
    projectId,
    actorId,
    action: notifType,
    taskId,
    summary: message.slice(0, 500),
    metadata: {
      taskTitle: params.taskTitle,
      taskDisplayId: displayId ?? undefined,
      field,
      previousText: normalizeNotesValue(params.previousValue),
      newText,
      changedByUserId: actorId,
      changedByName: actorName,
    },
  });

  const erpPayload = {
    id: `task-notes-${taskId}-${field}-${Date.now()}`,
    type: notifType,
    title,
    message,
    read: false,
    createdAt: at,
    projectId,
    taskId,
    field,
    taskTitle: params.taskTitle,
    taskDisplayId: displayId ?? undefined,
    updatedByName: actorName,
    previewText: preview || null,
    projectName,
    projectReferenceNumber,
  };

  const socketPayload = {
    id: erpPayload.id,
    projectId,
    projectName,
    projectReferenceNumber,
    taskId,
    taskTitle: params.taskTitle,
    taskDisplayId: displayId ?? undefined,
    field,
    actorId,
    actorName,
    preview: preview || null,
    updatedAt: at,
    type: notifType,
    title,
    message,
  };

  const io = getSocketIo();
  const participants = await fetchProjectChatParticipants(projectId);
  const notified = new Set<string>();

  const recipientIds: string[] = [];
  for (const participant of participants) {
    if (participant.id === actorId) continue;
    if (notified.has(participant.id)) continue;
    notified.add(participant.id);
    recipientIds.push(participant.id);
    emitErpNotification(participant.id, erpPayload);
    if (io) {
      io.to(`user:${participant.id}`).emit('erp:notification', erpPayload);
      io.to(`user:${participant.id}`).emit('task:notes-updated', socketPayload);
    }
  }

  void sendBrowserPushToUsers(
    recipientIds,
    {
      title,
      body: preview || message.slice(0, 180),
      url: buildTasksDeepLink(projectId, taskId),
      tag: `task-notes-${taskId}-${field}`,
    },
    actorId,
  );
}

/** Notify when remarks / assignee notes change on save (Main Table bulk save). */
export async function maybeNotifyTaskNotesFromSave(params: {
  projectId: string;
  projectName?: string | null;
  projectReferenceNumber?: string | null;
  taskId: string;
  taskTitle: string;
  actorId: string;
  existing: { remarks?: string | null; assigneeNotes?: string | null };
  incoming: { remarks?: unknown; assigneeNotes?: unknown };
}): Promise<void> {
  if (!params.actorId) return;

  const checks: Array<{ field: TaskNotesField; next: unknown }> = [
    { field: 'remarks', next: params.incoming.remarks },
    { field: 'assigneeNotes', next: params.incoming.assigneeNotes },
  ];

  for (const { field, next } of checks) {
    if (next === undefined) continue;
    await processTaskNotesChangeNotification({
      projectId: params.projectId,
      projectName: params.projectName,
      projectReferenceNumber: params.projectReferenceNumber,
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      field,
      actorId: params.actorId,
      previousValue: field === 'remarks' ? params.existing.remarks : params.existing.assigneeNotes,
      newValue: next == null ? null : String(next),
    });
  }
}
