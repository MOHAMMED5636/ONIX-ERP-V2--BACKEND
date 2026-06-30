import { Task, TaskAssignment, TaskStatus, UserRole } from '@prisma/client';
import {
  isProjectSuspendedStatus,
  PROJECT_SUSPENDED_MESSAGE,
  userCanBypassProjectSuspension,
} from './project-suspension';
import { enrichTaskNodeForClient, isTaskLockedByPredecessor } from './task-predecessor-unlock';

export type CurrentUser = {
  id: string;
  role: UserRole;
};

export type TaskWithAssignments = Task & {
  assignments?: Pick<TaskAssignment, 'employeeId'>[];
  delegations?: Record<string, unknown>[];
};

export type TaskPermissionContext = {
  user: CurrentUser;
  task: TaskWithAssignments;
  /** Project.creator user id — allows project owner to delete work items they did not personally create. */
  projectCreatedById?: string | null;
  /**
   * When the project is Suspended (Prisma `ON_HOLD`), assigned users cannot edit tasks/subtasks
   * except admins / HR / super-admin / project creator / project manager.
   */
  projectStatus?: string | null;
  /** True when the user is the contract/text PM for this project (not task-only manager access). */
  userManagesProject?: boolean;
};

export type TaskPermissions = {
  canEditMainFields: boolean;
  canEditAssigneeFields: boolean;
  canDelete: boolean;
  isProjectSuspended: boolean;
  suspensionMessage: string | null;
  /** Assignee cannot edit after marking task Done until a PM / project owner reopens it. */
  isDoneLocked: boolean;
  doneLockMessage: string | null;
};

export const TASK_DONE_LOCK_MESSAGE =
  'This task is completed and locked. Contact your project manager to request edits.';

export function isTaskDoneLockedStatus(status: unknown): boolean {
  return String(status ?? '').trim().toUpperCase() === TaskStatus.COMPLETED;
}

/** PM, manager, admin/HR, or project creator may edit or reopen completed tasks. */
export function userCanUnlockCompletedTask(
  user: CurrentUser,
  projectCreatedById: string | null | undefined,
  userManagesProject?: boolean,
): boolean {
  if (user.role === 'ADMIN' || user.role === 'HR' || user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'PROJECT_MANAGER' || user.role === 'MANAGER') {
    return userManagesProject === true;
  }
  if (
    projectCreatedById != null &&
    String(projectCreatedById).trim() !== '' &&
    projectCreatedById === user.id
  ) {
    return true;
  }
  return false;
}

function isPrivilegedForProject(user: CurrentUser, userManagesProject?: boolean): boolean {
  if (user.role === 'ADMIN' || user.role === 'HR' || user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'PROJECT_MANAGER' || user.role === 'MANAGER') {
    return userManagesProject === true;
  }
  return false;
}

function delegationInvolvesUser(d: any, userId: string): boolean {
  const newId = d?.newAssigneeId ?? d?.newAssignee?.id;
  const origId = d?.originalAssigneeId ?? d?.originalAssignee?.id;
  return newId === userId || origId === userId;
}

/** Assignee via direct assignee, task_assignments, or delegations (minimal or expanded relation shape). */
export function taskRowIsAssignee(
  task: {
    assignedEmployeeId: string | null;
    assignments?: { employeeId: string }[];
    delegations?: Record<string, unknown>[];
  },
  userId: string,
): boolean {
  if (task.assignedEmployeeId === userId) return true;
  if (task.assignments?.some((a) => a.employeeId === userId)) return true;
  return task.delegations?.some((d) => delegationInvolvesUser(d, userId)) ?? false;
}

export const MESSAGE_NO_PERMISSION_DELETE_TASK =
  'You can only delete this item if you manage the project as PM, created it, created the project, or are an administrator.';

export function computeTaskPermissions(ctx: TaskPermissionContext): TaskPermissions {
  const { user, task, projectCreatedById, projectStatus, userManagesProject } = ctx;

  const isElevated = user.role === 'ADMIN' || user.role === 'HR' || user.role === 'SUPER_ADMIN';
  const isPrivileged = isPrivilegedForProject(user, userManagesProject);
  const projectCreator =
    projectCreatedById != null && String(projectCreatedById).trim() !== '' && projectCreatedById === user.id;
  const taskCreator = task.createdBy != null && task.createdBy === user.id;

  const isAssignee = taskRowIsAssignee(task, user.id);
  // Non-privileged assignees on someone else's row may only edit assignee-scoped fields.
  // PMs / managers keep full main-field access even when they are the assignee.
  const assigneeRestricted =
    isAssignee && !taskCreator && !projectCreator && !isPrivileged;

  let canEditMainFields = isElevated || taskCreator || projectCreator || (isPrivileged && !assigneeRestricted);

  let canEditAssigneeFields = canEditMainFields || isAssignee;

  let canDelete =
    isElevated || taskCreator || projectCreator || (isPrivileged && userManagesProject === true);

  const projectSuspended = isProjectSuspendedStatus(projectStatus);
  const canBypassProjectSuspension =
    isElevated || userCanBypassProjectSuspension(user, projectCreatedById ?? null);

  if (projectSuspended && !canBypassProjectSuspension) {
    canEditMainFields = false;
    canEditAssigneeFields = false;
    canDelete = false;
  }

  const canUnlockDone = userCanUnlockCompletedTask(user, projectCreatedById, userManagesProject);
  const doneLocked = isTaskDoneLockedStatus(task.status) && !canUnlockDone;

  if (doneLocked) {
    canEditMainFields = false;
    canEditAssigneeFields = false;
    canDelete = false;
  }

  return {
    canEditMainFields,
    canEditAssigneeFields,
    canDelete,
    isProjectSuspended: projectSuspended,
    suspensionMessage: projectSuspended ? PROJECT_SUSPENDED_MESSAGE : null,
    isDoneLocked: doneLocked,
    doneLockMessage: doneLocked ? TASK_DONE_LOCK_MESSAGE : null,
  };
}

/** Attach `permissions` on each task node (recursive `subtasks`). */
export function mapTaskTreeWithPermissions(
  tasks: any[] | undefined,
  user: CurrentUser | null | undefined,
  projectCreatedById: string | null | undefined,
  projectStatus?: string | null,
  userManagesProject?: boolean,
): any[] {
  if (!tasks || !Array.isArray(tasks)) {
    return [];
  }
  const pid = projectCreatedById ?? null;
  return tasks.map((t) => {
    const perms = user
      ? computeTaskPermissions({
          user,
          task: t as TaskWithAssignments,
          projectCreatedById: pid,
          projectStatus,
          userManagesProject,
        })
      : null;
    const locked = isTaskLockedByPredecessor(t);
    const doneLocked = perms?.isDoneLocked ?? false;
    const nested = t.subtasks;
    const withPerms = {
      ...t,
      ...(perms ? { permissions: perms } : {}),
      isLockedByPredecessor: locked,
      canChangeStatus: locked || doneLocked ? false : true,
      subtasks:
        nested && Array.isArray(nested) && nested.length > 0
          ? mapTaskTreeWithPermissions(nested, user, pid, projectStatus, userManagesProject)
          : nested,
    };
    return enrichTaskNodeForClient(withPerms);
  });
}

export function hasMainFieldChanges(body: any): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const {
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
