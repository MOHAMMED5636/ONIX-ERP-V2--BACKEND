import prisma from '../config/database';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'HR', 'PROJECT_MANAGER', 'SUPER_ADMIN']);

export const PARTICIPANT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  photo: true,
} as const;

export type ChatParticipantUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  photo: string | null;
};

/** Everyone who can collaborate on this project chat: explicit members + project assignees + task assignees. */
export async function fetchProjectChatParticipants(projectId: string): Promise<ChatParticipantUser[]> {
  const [explicitMembers, projectAssignments, tasks] = await Promise.all([
    prisma.projectChatParticipant.findMany({
      where: { projectId },
      include: { user: { select: PARTICIPANT_USER_SELECT } },
    }),
    prisma.projectAssignment.findMany({
      where: { projectId },
      include: { employee: { select: PARTICIPANT_USER_SELECT } },
    }),
    prisma.task.findMany({
      where: { projectId },
      select: {
        assignedEmployee: { select: PARTICIPANT_USER_SELECT },
        assignments: { include: { employee: { select: PARTICIPANT_USER_SELECT } } },
      },
    }),
  ]);

  const byId = new Map<string, ChatParticipantUser>();
  const add = (user: ChatParticipantUser | null | undefined) => {
    if (user?.id) byId.set(user.id, user);
  };

  for (const row of explicitMembers) add(row.user);
  for (const row of projectAssignments) add(row.employee);
  for (const task of tasks) {
    add(task.assignedEmployee);
    for (const a of task.assignments) add(a.employee);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || '';
    const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.email || '';
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}

export async function canUserAccessProjectChat(
  projectId: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (!userId) return false;
  if (PRIVILEGED_ROLES.has(String(role || ''))) return true;

  const explicitMember = await prisma.projectChatParticipant.findFirst({
    where: { projectId, userId },
    select: { id: true },
  });
  if (explicitMember) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignedEmployees: { select: { employeeId: true } },
    },
  });
  if (!project) return false;

  if (project.assignedEmployees.some((a) => a.employeeId === userId)) return true;

  const assignedOnTask = await prisma.task.findFirst({
    where: {
      projectId,
      OR: [{ assignedEmployeeId: userId }, { assignments: { some: { employeeId: userId } } }],
    },
    select: { id: true },
  });
  return Boolean(assignedOnTask);
}
