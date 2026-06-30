import { Prisma } from '@prisma/client';

/**
 * Prisma WHERE clause: any active task row (root or subtask) where this employee is involved.
 * Aligns with getAllTasks employee visibility (assignee, assignment, creator, delegation original).
 */
export function taskRowInvolvesEmployee(employeeId: string): Prisma.TaskWhereInput {
  return {
    deletedAt: null,
    OR: [
      { assignedEmployeeId: employeeId },
      { assignments: { some: { employeeId } } },
      { createdBy: employeeId },
      { delegations: { some: { originalAssigneeId: employeeId } } },
    ],
  };
}

/**
 * Employee My Tasks / project list: only active rows where the employee is an assignee
 * (direct assignee, task assignment, or delegation). Excludes createdBy-only visibility.
 */
export function taskRowAssignedToEmployee(employeeId: string): Prisma.TaskWhereInput {
  return {
    deletedAt: null,
    OR: [
      { assignedEmployeeId: employeeId },
      { assignments: { some: { employeeId } } },
      {
        delegations: {
          some: {
            OR: [{ originalAssigneeId: employeeId }, { newAssigneeId: employeeId }],
          },
        },
      },
    ],
  };
}

const activeSubtask = (clause: Prisma.TaskWhereInput): Prisma.TaskWhereInput => ({
  deletedAt: null,
  ...clause,
});

const delegationAssignedClause = (employeeId: string): Prisma.TaskWhereInput => ({
  delegations: {
    some: {
      OR: [{ originalAssigneeId: employeeId }, { newAssigneeId: employeeId }],
    },
  },
});

/** Main tasks (roots) visible in project list when employee is assigned on subtasks / delegations. */
export function mainTaskVisibleToEmployeeInProject(employeeId: string): Prisma.TaskWhereInput[] {
  return [
    { assignedEmployeeId: employeeId },
    { createdBy: employeeId },
    { assignments: { some: { employeeId } } },
    { subtasks: { some: activeSubtask({ assignedEmployeeId: employeeId }) } },
    { subtasks: { some: activeSubtask({ assignments: { some: { employeeId } } }) } },
    { subtasks: { some: activeSubtask({ assignedEmployeeId: null, createdBy: employeeId }) } },
    { subtasks: { some: activeSubtask({ createdBy: employeeId }) } },
    { subtasks: { some: activeSubtask(delegationAssignedClause(employeeId)) } },
    { subtasks: { some: { subtasks: { some: activeSubtask({ assignedEmployeeId: employeeId }) } } } },
    { subtasks: { some: { subtasks: { some: activeSubtask({ assignments: { some: { employeeId } } }) } } } },
    {
      subtasks: {
        some: { subtasks: { some: activeSubtask({ assignedEmployeeId: null, createdBy: employeeId }) } },
      },
    },
    { subtasks: { some: { subtasks: { some: activeSubtask({ createdBy: employeeId }) } } } },
    { subtasks: { some: { subtasks: { some: activeSubtask(delegationAssignedClause(employeeId)) } } } },
  ];
}

/** Assignee-only variant for employee ERP project/task visibility. */
export function mainTaskVisibleToAssignedEmployeeInProject(
  employeeId: string,
): Prisma.TaskWhereInput[] {
  return [
    { assignedEmployeeId: employeeId },
    { assignments: { some: { employeeId } } },
    delegationAssignedClause(employeeId),
    { subtasks: { some: activeSubtask({ assignedEmployeeId: employeeId }) } },
    { subtasks: { some: activeSubtask({ assignments: { some: { employeeId } } }) } },
    { subtasks: { some: activeSubtask(delegationAssignedClause(employeeId)) } },
    { subtasks: { some: { subtasks: { some: activeSubtask({ assignedEmployeeId: employeeId }) } } } },
    { subtasks: { some: { subtasks: { some: activeSubtask({ assignments: { some: { employeeId } } }) } } } },
    { subtasks: { some: { subtasks: { some: activeSubtask(delegationAssignedClause(employeeId)) } } } },
  ];
}

/** True when a task node is assigned to the employee (not createdBy-only). */
export function isTaskNodeAssignedToEmployee(
  task: {
    assignedEmployeeId?: string | null;
    assignments?: { employeeId?: string | null }[];
    delegations?: { originalAssigneeId?: string | null; newAssigneeId?: string | null }[];
  } | null | undefined,
  employeeId: string,
): boolean {
  if (!task || !employeeId) return false;
  if (task.assignedEmployeeId === employeeId) return true;
  if (
    Array.isArray(task.assignments) &&
    task.assignments.some((a) => a?.employeeId === employeeId)
  ) {
    return true;
  }
  if (
    Array.isArray(task.delegations) &&
    task.delegations.some(
      (d) => d?.originalAssigneeId === employeeId || d?.newAssigneeId === employeeId,
    )
  ) {
    return true;
  }
  return false;
}
