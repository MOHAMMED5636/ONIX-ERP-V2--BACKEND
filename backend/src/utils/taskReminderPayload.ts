export function formatReminderSummary(reminder: { frequency: string; hour: number; minute: number }): string {
  const h12 = reminder.hour % 12 || 12;
  const ampm = reminder.hour >= 12 ? 'pm' : 'am';
  const min = String(reminder.minute).padStart(2, '0');
  const freqLabel =
    reminder.frequency === 'WEEKLY' ? 'Weekly' : reminder.frequency === 'ONCE' ? 'Once' : 'Daily';
  return `${freqLabel} at ${h12}:${min} ${ampm}`;
}

export function buildTaskReminderClientPayload(row: {
  id: string;
  taskId: string;
  frequency: string;
  hour: number;
  minute: number;
  description: string | null;
  task: {
    id: string;
    title: string;
    project: { id: string; name: string; referenceNumber: string | null };
  };
  sentAt?: Date | string | null;
}) {
  const summary = formatReminderSummary(row);
  const taskName = row.task.title || 'Subtask';
  const projectName = row.task.project.name || 'Project';
  const projectRef = row.task.project.referenceNumber || '';
  const message =
    (row.description && row.description.trim()) ||
    `Reminder for ${taskName}${projectRef ? ` (${projectRef})` : ''}`;
  const sentAt =
    row.sentAt instanceof Date
      ? row.sentAt.toISOString()
      : row.sentAt
        ? String(row.sentAt)
        : new Date().toISOString();

  return {
    reminderId: row.id,
    taskId: row.taskId,
    projectId: row.task.project.id,
    projectName,
    projectReferenceNumber: projectRef,
    taskName,
    summary,
    description: row.description,
    message,
    sentAt,
  };
}
