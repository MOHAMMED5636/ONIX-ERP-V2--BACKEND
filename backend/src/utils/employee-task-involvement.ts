import { Prisma } from '@prisma/client';

/**
 * Prisma WHERE clause: any task row (root or subtask) where this employee is involved.
 * Aligns with getAllTasks employee visibility (assignee, assignment, creator, delegation original).
 */
export function taskRowInvolvesEmployee(employeeId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { assignedEmployeeId: employeeId },
      { assignments: { some: { employeeId } } },
      { createdBy: employeeId },
      { delegations: { some: { originalAssigneeId: employeeId } } },
    ],
  };
}

/** Main tasks (roots) visible in project list when employee is only on subtasks / delegations. */
export function mainTaskVisibleToEmployeeInProject(employeeId: string): Prisma.TaskWhereInput[] {
  return [
    { assignedEmployeeId: employeeId },
    { createdBy: employeeId },
    { assignments: { some: { employeeId } } },
    { subtasks: { some: { assignedEmployeeId: employeeId } } },
    { subtasks: { some: { assignments: { some: { employeeId } } } } },
    { subtasks: { some: { assignedEmployeeId: null, createdBy: employeeId } } },
    { subtasks: { some: { createdBy: employeeId } } },
    { subtasks: { some: { delegations: { some: { originalAssigneeId: employeeId } } } } },
    { subtasks: { some: { subtasks: { some: { assignedEmployeeId: employeeId } } } } },
    { subtasks: { some: { subtasks: { some: { assignments: { some: { employeeId } } } } } } },
    { subtasks: { some: { subtasks: { some: { assignedEmployeeId: null, createdBy: employeeId } } } } },
    { subtasks: { some: { subtasks: { some: { createdBy: employeeId } } } } },
    {
      subtasks: {
        some: { subtasks: { some: { delegations: { some: { originalAssigneeId: employeeId } } } } },
      },
    },
  ];
}
