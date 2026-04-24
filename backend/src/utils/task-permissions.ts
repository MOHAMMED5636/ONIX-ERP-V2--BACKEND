import { Task, TaskAssignment, UserRole } from '@prisma/client';

// Shape of the current authenticated user needed for permission checks
export type CurrentUser = {
  id: string;
  role: UserRole;
};

// Task plus minimal relations needed for permission evaluation
export type TaskWithAssignments = Task & {
  assignments?: Pick<TaskAssignment, 'employeeId'>[];
};

export type TaskPermissionContext = {
  user: CurrentUser;
  task: TaskWithAssignments;
};

export type TaskPermissions = {
  /**
   * Full control over main task fields such as:
   * - title, description
   * - priority, dates (startDate, dueDate)
   * - assignee (assignedEmployeeId, TaskAssignment)
   * - predecessors
   *
   * Granted only to:
   * - privileged roles (ADMIN / PROJECT_MANAGER / HR / MANAGER)
   * - the task creator
   *
   * Assignees who did not create the task cannot edit main fields.
   */
  canEditMainFields: boolean;

  /**
   * Assignee‑side fields:
   * - remarks
   * - assigneeNotes
   * - attachments (handled in attachment controllers)
   * - status (so assignees can mark tasks done)
   *
   * Granted to: privileged roles, creator, and the assignee.
   * Assignees can only edit these fields, not main fields.
   */
  canEditAssigneeFields: boolean;

  /**
   * Whether the user can delete this task entirely.
   * (You can keep using the existing deleteTask logic; this is provided
   *  for reuse where convenient.)
   */
  canDelete: boolean;
};

const PRIVILEGED_ROLES: UserRole[] = ['ADMIN', 'PROJECT_MANAGER', 'HR', 'MANAGER'];

/**
 * Compute permissions for a given user on a specific task, based on:
 * - global role (ADMIN / PROJECT_MANAGER / HR)
 * - whether they created the task
 * - whether they are an assignee (root assignment or direct assignedEmployeeId)
 */
export function computeTaskPermissions(ctx: TaskPermissionContext): TaskPermissions {
  const { user, task } = ctx;

  const isPrivileged = PRIVILEGED_ROLES.includes(user.role);
  const isCreator = task.createdBy === user.id;

  const isAssignedViaRoot =
    task.assignments?.some((a) => a.employeeId === user.id) ?? false;
  const isAssignedViaChild = task.assignedEmployeeId === user.id;
  const isAssignee = isAssignedViaRoot || isAssignedViaChild;

  // Main fields (title, description, priority, deadline, assignee, predecessors)
  // only for privileged roles and the task creator. Assignees cannot edit these.
  const canEditMainFields = isPrivileged || isCreator;

  // Assignee fields (remarks, assigneeNotes, attachments) and status:
  // privileged, creator, and assignee. So assignees can add remarks/notes
  // and mark status (e.g. Done) but not change core task definition.
  const canEditAssigneeFields = isPrivileged || isCreator || isAssignee;

  // Deletion is intentionally stricter: privileged roles or creator.
  const canDelete = isPrivileged || isCreator;

  return {
    canEditMainFields,
    canEditAssigneeFields,
    canDelete,
  };
}

/**
 * Utility to detect whether the incoming payload is attempting to
 * modify any "main" task fields. Used to enforce read‑only behaviour
 * for assignees while still allowing them to touch remarks/notes.
 */
export function hasMainFieldChanges(body: any): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const {
    title,
    description,
    // status is intentionally excluded here: assignees are allowed
    // to change status, so it is not treated as a "main" field
    priority,
    startDate,
    dueDate,
    estimatedHours,
    actualHours,
    tags,
    assignedEmployeeId,
    predecessors,
    predecessorId,
    projectId,
    parentTaskId,
  } = body;

  return [
    title,
    description,
    priority,
    startDate,
    dueDate,
    estimatedHours,
    actualHours,
    tags,
    assignedEmployeeId,
    predecessors,
    predecessorId,
    projectId,
    parentTaskId,
  ].some((v) => v !== undefined);
}

