import { Prisma, ProjectManagerTransferStatus, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { logProjectActivity } from './projectActivity.service';
import { notifyPmProjectAssignment } from './projectPmAssignmentNotice.service';

export type ManagerTransferScope = {
  excludedProjectIds: string[];
  includedProjectIds: string[];
};

const PM_ROLES = new Set<UserRole>([UserRole.MANAGER, UserRole.PROJECT_MANAGER]);

export function isPmTransferAdmin(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

function activeTransferWhere(now = new Date()): Prisma.ProjectManagerTransferWhereInput {
  return {
    status: ProjectManagerTransferStatus.ACTIVE,
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gte: now } }],
  };
}

function managerDisplayName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim().substring(0, 100);
}

export async function getManagerTransferScope(managerId: string): Promise<ManagerTransferScope> {
  const base = activeTransferWhere();
  const [excluded, included] = await Promise.all([
    prisma.projectManagerTransfer.findMany({
      where: { ...base, oldProjectManagerId: managerId },
      select: { projectId: true },
    }),
    prisma.projectManagerTransfer.findMany({
      where: { ...base, newProjectManagerId: managerId },
      select: { projectId: true },
    }),
  ]);
  return {
    excludedProjectIds: excluded.map((r: { projectId: string }) => r.projectId),
    includedProjectIds: included.map((r: { projectId: string }) => r.projectId),
  };
}

export async function getActiveTransferForProject(projectId: string) {
  return prisma.projectManagerTransfer.findFirst({
    where: { projectId, ...activeTransferWhere() },
    include: {
      oldProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      newProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      transferredBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      project: { select: { id: true, name: true, referenceNumber: true } },
    },
  });
}

async function projectOwnedByManager(projectId: string, managerId: string, email?: string | null) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      contracts: {
        select: { assignedManagerId: true, assignedManagerEmail: true },
      },
    },
  });
  if (!project) return false;
  return project.contracts.some(
    (c) =>
      c.assignedManagerId === managerId ||
      (email && c.assignedManagerEmail && c.assignedManagerEmail.toLowerCase() === email.toLowerCase()),
  );
}

async function applyTransferToProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  newManager: { id: string; email: string; firstName: string; lastName: string },
  snapshot: { previousManagerId: string | null; previousManagerEmail: string | null; previousProjectManagerText: string | null },
) {
  const pmText = managerDisplayName(newManager);
  await tx.project.update({
    where: { id: projectId },
    data: { projectManager: pmText },
  });
  await tx.contract.updateMany({
    where: { projectId },
    data: {
      assignedManagerId: newManager.id,
      assignedManagerEmail: newManager.email,
      projectManager: pmText,
    },
  });
  return snapshot;
}

async function revertTransferOnProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  snapshot: {
    previousManagerId: string | null;
    previousManagerEmail: string | null;
    previousProjectManagerText: string | null;
  },
) {
  await tx.project.update({
    where: { id: projectId },
    data: { projectManager: snapshot.previousProjectManagerText },
  });
  await tx.contract.updateMany({
    where: { projectId },
    data: {
      assignedManagerId: snapshot.previousManagerId,
      assignedManagerEmail: snapshot.previousManagerEmail,
      projectManager: snapshot.previousProjectManagerText,
    },
  });
}

export async function listProjectsForManager(managerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: managerId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) return [];

  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      contracts: {
        some: {
          OR: [
            { assignedManagerId: managerId },
            ...(user.email ? [{ assignedManagerEmail: user.email }] : []),
          ],
        },
      },
    },
    select: {
      id: true,
      name: true,
      referenceNumber: true,
      projectManager: true,
      status: true,
      contracts: {
        select: { assignedManagerId: true, assignedManagerEmail: true },
        take: 1,
      },
    },
    orderBy: { projectNumber: 'asc' },
  });

  const activeAway = await prisma.projectManagerTransfer.findMany({
    where: { oldProjectManagerId: managerId, ...activeTransferWhere() },
    select: { projectId: true },
  });
  const awayIds = new Set(activeAway.map((t: { projectId: string }) => t.projectId));
  return projects.filter((p) => !awayIds.has(p.id));
}

export async function createProjectManagerTransfers(input: {
  projectIds: string[];
  oldProjectManagerId: string;
  newProjectManagerId: string;
  startDate: string;
  endDate?: string | null;
  transferReason?: string;
  transferredById: string;
}) {
  const {
    projectIds,
    oldProjectManagerId,
    newProjectManagerId,
    startDate,
    endDate,
    transferReason,
    transferredById,
  } = input;

  if (!projectIds.length) {
    throw new Error('Select at least one project to transfer');
  }
  if (oldProjectManagerId === newProjectManagerId) {
    throw new Error('Replacement Project Manager must be different from the original');
  }

  const [oldPm, newPm] = await Promise.all([
    prisma.user.findUnique({
      where: { id: oldProjectManagerId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    }),
    prisma.user.findUnique({
      where: { id: newProjectManagerId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    }),
  ]);

  if (!oldPm?.isActive || !PM_ROLES.has(oldPm.role)) {
    throw new Error('Original Project Manager is invalid or not a PM role');
  }
  if (!newPm?.isActive || !PM_ROLES.has(newPm.role)) {
    throw new Error('Replacement Project Manager is invalid or not a PM role');
  }

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid start date');
  const end = endDate ? new Date(endDate) : null;
  if (end && Number.isNaN(end.getTime())) throw new Error('Invalid end date');
  if (end && end < start) throw new Error('End date must be on or after start date');

  for (const projectId of projectIds) {
    const owned = await projectOwnedByManager(projectId, oldPm.id, oldPm.email);
    if (!owned) {
      throw new Error(`Project ${projectId} is not assigned to the original Project Manager`);
    }
    const existing = await getActiveTransferForProject(projectId);
    if (existing) {
      throw new Error(`Project already has an active temporary transfer (${existing.project?.referenceNumber || projectId})`);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const projectId of projectIds) {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: {
          contracts: {
            select: { assignedManagerId: true, assignedManagerEmail: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      const primaryContract = project.contracts[0];
      const snapshot = {
        previousManagerId: primaryContract?.assignedManagerId ?? null,
        previousManagerEmail: primaryContract?.assignedManagerEmail ?? null,
        previousProjectManagerText: project.projectManager ?? null,
      };

      await applyTransferToProject(tx, projectId, newPm, snapshot);

      const row = await tx.projectManagerTransfer.create({
        data: {
          projectId,
          oldProjectManagerId: oldPm.id,
          newProjectManagerId: newPm.id,
          transferReason: transferReason?.trim() || null,
          startDate: start,
          endDate: end,
          transferredById,
          status: ProjectManagerTransferStatus.ACTIVE,
          previousManagerId: snapshot.previousManagerId,
          previousManagerEmail: snapshot.previousManagerEmail,
          previousProjectManagerText: snapshot.previousProjectManagerText,
        },
        include: {
          project: { select: { id: true, name: true, referenceNumber: true } },
          oldProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
          newProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
          transferredBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await logProjectActivity({
        projectId,
        actorId: transferredById,
        action: 'PM_TRANSFER_OUT',
        summary: `Temporary PM transfer: ${oldPm.firstName} ${oldPm.lastName} → ${newPm.firstName} ${newPm.lastName}${transferReason ? ` (${transferReason})` : ''}`,
        metadata: {
          transferId: row.id,
          oldProjectManagerId: oldPm.id,
          newProjectManagerId: newPm.id,
          startDate,
          endDate: endDate || null,
          reason: transferReason || null,
        },
      });

      rows.push(row);
    }
    return rows;
  });

  for (const row of created) {
    await notifyPmProjectAssignment(row.newProjectManagerId, row.projectId, 'TRANSFER', transferredById);
  }

  return created;
}

export async function completeProjectManagerTransfer(transferId: string, completedById: string | null) {
  const transfer = await prisma.projectManagerTransfer.findUnique({
    where: { id: transferId },
    include: {
      project: { select: { id: true, name: true, referenceNumber: true } },
      oldProjectManager: { select: { firstName: true, lastName: true } },
      newProjectManager: { select: { firstName: true, lastName: true } },
    },
  });
  if (!transfer) throw new Error('Transfer not found');
  if (transfer.status !== ProjectManagerTransferStatus.ACTIVE) {
    throw new Error('Transfer is already completed');
  }

  await prisma.$transaction(async (tx) => {
    await revertTransferOnProject(tx, transfer.projectId, {
      previousManagerId: transfer.previousManagerId,
      previousManagerEmail: transfer.previousManagerEmail,
      previousProjectManagerText: transfer.previousProjectManagerText,
    });
    await tx.projectManagerTransfer.update({
      where: { id: transferId },
      data: {
        status: ProjectManagerTransferStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await logProjectActivity({
      projectId: transfer.projectId,
      actorId: completedById,
      action: 'PM_TRANSFER_RETURN',
      summary: `Projects returned to ${transfer.oldProjectManager.firstName} ${transfer.oldProjectManager.lastName} after temporary cover by ${transfer.newProjectManager.firstName} ${transfer.newProjectManager.lastName}`,
      metadata: { transferId },
    });
  });

  return transfer;
}

export async function processExpiredProjectManagerTransfers(): Promise<number> {
  const now = new Date();
  const due = await prisma.projectManagerTransfer.findMany({
    where: {
      status: ProjectManagerTransferStatus.ACTIVE,
      endDate: { not: null, lt: now },
    },
    select: { id: true, transferredById: true },
  });

  let completed = 0;
  for (const row of due) {
    try {
      await completeProjectManagerTransfer(row.id, row.transferredById);
      completed += 1;
    } catch (e) {
      console.error('[pm-transfer] auto-return failed:', row.id, e);
    }
  }
  return completed;
}

export async function listProjectManagerTransfers(filters: {
  status?: ProjectManagerTransferStatus;
  managerId?: string;
}) {
  const where: Prisma.ProjectManagerTransferWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.managerId) {
    where.OR = [
      { oldProjectManagerId: filters.managerId },
      { newProjectManagerId: filters.managerId },
    ];
  }

  return prisma.projectManagerTransfer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, name: true, referenceNumber: true } },
      oldProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      newProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      transferredBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function listProjectManagersForTransfer() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.MANAGER, UserRole.PROJECT_MANAGER] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      department: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}
