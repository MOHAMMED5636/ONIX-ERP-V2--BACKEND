import { TaskStatus } from '@prisma/client';

/** Frontend Main Table subtask status value */
export const FRONTEND_SUBMITTED_IN_PROGRESS = 'submitted in progress';

export function mapFrontendTaskStatusToEnum(status: unknown): TaskStatus {
  if (status == null) return TaskStatus.PENDING;
  const s = String(status).trim().toLowerCase();
  const map: Record<string, TaskStatus> = {
    'not started': TaskStatus.PENDING,
    pending: TaskStatus.PENDING,
    working: TaskStatus.IN_PROGRESS,
    'in progress': TaskStatus.IN_PROGRESS,
    [FRONTEND_SUBMITTED_IN_PROGRESS]: TaskStatus.SUBMITTED_IN_PROGRESS,
    'submitted-in progress': TaskStatus.SUBMITTED_IN_PROGRESS,
    'submitted_in_progress': TaskStatus.SUBMITTED_IN_PROGRESS,
    'not required': TaskStatus.NOT_REQUIRED,
    not_required: TaskStatus.NOT_REQUIRED,
    done: TaskStatus.COMPLETED,
    completed: TaskStatus.COMPLETED,
    stuck: TaskStatus.ON_HOLD,
    cancelled: TaskStatus.CANCELLED,
    suspended: TaskStatus.ON_HOLD,
    'on hold': TaskStatus.ON_HOLD,
  };
  if (map[s]) return map[s];
  if (s.startsWith('done')) return TaskStatus.COMPLETED;
  if (s.includes('waiting') && s.includes('predecessor')) return TaskStatus.PENDING;
  return TaskStatus.PENDING;
}

export function mapEnumToFrontendTaskStatus(status: unknown): string {
  const s = String(status ?? '')
    .trim()
    .toUpperCase();
  if (s === 'IN_PROGRESS') return 'working';
  if (s === 'SUBMITTED_IN_PROGRESS') return FRONTEND_SUBMITTED_IN_PROGRESS;
  if (s === 'NOT_REQUIRED') return 'not required';
  if (s === 'COMPLETED') return 'done';
  // The Kanban board uses a "Suspended" column for ON_HOLD.
  // Still accept "stuck" as an input (mapped above), but standardize output to "suspended".
  if (s === 'ON_HOLD') return 'suspended';
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'PENDING') return 'not started';
  return String(status ?? 'not started').toLowerCase();
}
