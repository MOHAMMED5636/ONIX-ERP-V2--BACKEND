import prisma from '../config/database';

export type ResolvedLineManagers = {
  primaryId: string | null;
  secondaryId: string | null;
};

/** Primary + second line manager from employee profile (deduped). */
export async function resolveLineManagers(employeeUserId: string): Promise<ResolvedLineManagers> {
  const u = await prisma.user.findUnique({
    where: { id: employeeUserId },
    select: { managerId: true, secondLineManagerId: true, department: true, position: true },
  });
  if (!u) return { primaryId: null, secondaryId: null };

  let primaryId = u.managerId?.trim() || null;

  if (!primaryId) {
    const deptName = u.department?.trim();
    if (deptName) {
      const dept = await prisma.department.findFirst({
        where: { name: { equals: deptName, mode: 'insensitive' }, managerId: { not: null } },
        select: { managerId: true },
      });
      if (dept?.managerId) primaryId = dept.managerId;
    }
  }

  if (!primaryId) {
    const posName = u.position?.trim();
    if (posName) {
      const pos = await prisma.position.findFirst({
        where: { name: { equals: posName, mode: 'insensitive' }, managerId: { not: null } },
        select: { managerId: true },
      });
      if (pos?.managerId) primaryId = pos.managerId;

      if (!primaryId) {
        const posWithSub = await prisma.position.findFirst({
          where: { name: { equals: posName, mode: 'insensitive' } },
          select: { subDepartment: { select: { managerId: true } } },
        });
        if (posWithSub?.subDepartment?.managerId) primaryId = posWithSub.subDepartment.managerId;
      }
    }
  }

  let secondaryId = u.secondLineManagerId?.trim() || null;
  if (secondaryId && primaryId && secondaryId === primaryId) secondaryId = null;

  return { primaryId, secondaryId };
}

export function requiresSecondManagerApproval(leave: {
  assignedSecondLineManagerId?: string | null;
  secondManagerApprovalStatus?: string;
}): boolean {
  return (
    !!leave.assignedSecondLineManagerId &&
    leave.secondManagerApprovalStatus !== 'NOT_REQUIRED'
  );
}

export function bothManagersApproved(leave: {
  managerApprovalStatus: string;
  secondManagerApprovalStatus?: string;
  assignedSecondLineManagerId?: string | null;
}): boolean {
  if (leave.managerApprovalStatus !== 'APPROVED') return false;
  if (!requiresSecondManagerApproval(leave)) return true;
  return leave.secondManagerApprovalStatus === 'APPROVED';
}

export function pendingManagerActorLabel(leave: {
  managerApprovalStatus: string;
  secondManagerApprovalStatus?: string;
  assignedSecondLineManagerId?: string | null;
}): 'primary' | 'secondary' | 'done' | 'none' {
  if (leave.managerApprovalStatus === 'PENDING') return 'primary';
  if (
    requiresSecondManagerApproval(leave) &&
    leave.secondManagerApprovalStatus === 'PENDING'
  ) {
    return 'secondary';
  }
  if (leave.managerApprovalStatus === 'APPROVED') return 'done';
  return 'none';
}

export async function employeeHasLineManager(employeeUserId: string, managerUserId: string): Promise<boolean> {
  if (employeeUserId === managerUserId) return false;
  const u = await prisma.user.findUnique({
    where: { id: employeeUserId },
    select: { managerId: true, secondLineManagerId: true },
  });
  if (!u) return false;
  if (u.managerId === managerUserId || u.secondLineManagerId === managerUserId) return true;

  const leaveAssigned = await prisma.leave.findFirst({
    where: {
      userId: employeeUserId,
      OR: [
        { assignedLineManagerId: managerUserId },
        { assignedSecondLineManagerId: managerUserId },
      ],
    },
    select: { id: true },
  });
  return !!leaveAssigned;
}
