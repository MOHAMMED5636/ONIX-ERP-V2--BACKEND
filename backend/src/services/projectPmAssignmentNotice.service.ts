import { UserRole } from '@prisma/client';
import prisma from '../config/database';
import { notifyProjectManagerAssignedEmail } from './emailDispatch.service';

const PM_ROLES = new Set<UserRole>([
  UserRole.MANAGER,
  UserRole.PROJECT_MANAGER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

export function isPmInboxRole(role: string | undefined): boolean {
  return !!role && PM_ROLES.has(role as UserRole);
}

export async function notifyPmProjectAssignment(
  userId: string | null | undefined,
  projectId: string,
  source: 'TRANSFER' | 'ASSIGNMENT' = 'ASSIGNMENT',
  actorUserId?: string | null,
): Promise<void> {
  if (!userId) return;
  if (actorUserId && actorUserId === userId) return;

  const [manager, project, actor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    }),
    prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        projectNumber: true,
        startDate: true,
        deadline: true,
        client: { select: { name: true } },
      },
    }),
    actorUserId
      ? prisma.user.findUnique({
          where: { id: actorUserId },
          select: { firstName: true, lastName: true },
        })
      : Promise.resolve(null),
  ]);

  if (!manager?.isActive || !PM_ROLES.has(manager.role)) return;
  if (!project) return;

  await prisma.projectPmAssignmentNotice.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, source },
    update: { source, notifiedAt: new Date(), seenAt: null },
  });

  if (manager.email) {
    const emailResult = await notifyProjectManagerAssignedEmail({
      manager,
      project,
      assignedBy: actor,
    });
    if (!emailResult.sent) {
      console.warn(
        `PM assignment email not sent for project ${project.referenceNumber || project.id} → ${manager.email}:`,
        emailResult.reason,
      );
    }
  }
}

export async function listUnseenPmAssignments(userId: string) {
  return prisma.projectPmAssignmentNotice.findMany({
    where: { userId, seenAt: null },
    orderBy: { notifiedAt: 'desc' },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          referenceNumber: true,
          projectNumber: true,
          status: true,
        },
      },
    },
  });
}

export async function acknowledgePmAssignments(userId: string, projectIds?: string[]): Promise<void> {
  const where: { userId: string; seenAt: null; projectId?: { in: string[] } } = {
    userId,
    seenAt: null,
  };
  if (projectIds?.length) {
    where.projectId = { in: projectIds };
  }

  await prisma.projectPmAssignmentNotice.updateMany({
    where,
    data: { seenAt: new Date() },
  });
}
