import prisma from '../config/database';

type PositionWithSub = {
  id: string;
  subDepartment: {
    id: string;
    managerId: string | null;
  } | null;
};

function resolvePositionManagerId(position: PositionWithSub | null): string | null {
  if (!position?.subDepartment?.managerId) return null;
  return position.subDepartment.managerId;
}

async function findPrimaryOrgPosition(user: {
  position: string | null;
  department: string | null;
  jobTitle: string | null;
}): Promise<PositionWithSub | null> {
  const posName = user.position?.trim() || user.jobTitle?.trim();
  if (!posName) return null;

  const deptName = user.department?.trim();
  if (deptName) {
    const matched = await prisma.position.findFirst({
      where: {
        name: { equals: posName, mode: 'insensitive' },
        OR: [
          { subDepartment: { name: { equals: deptName, mode: 'insensitive' } } },
          { subDepartment: { department: { name: { equals: deptName, mode: 'insensitive' } } } },
        ],
      },
      select: {
        id: true,
        subDepartment: { select: { id: true, managerId: true } },
      },
    });
    if (matched) return matched;
  }

  return prisma.position.findFirst({
    where: { name: { equals: posName, mode: 'insensitive' } },
    select: {
      id: true,
      subDepartment: { select: { id: true, managerId: true } },
    },
  });
}

/**
 * Collect sub-department manager IDs: primary org position first, then additional assignments.
 */
export async function resolveSubDepartmentManagerIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, position: true, department: true, jobTitle: true },
  });
  if (!user) return [];

  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (managerId: string | null | undefined) => {
    if (!managerId || managerId === userId || seen.has(managerId)) return;
    seen.add(managerId);
    ordered.push(managerId);
  };

  const primary = await findPrimaryOrgPosition(user);
  add(resolvePositionManagerId(primary));

  const assignments = await prisma.employeePositionAssignment.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      position: {
        select: {
          id: true,
          subDepartment: { select: { id: true, managerId: true } },
        },
      },
    },
  });

  for (const row of assignments) {
    if (primary && row.position.id === primary.id) continue;
    add(resolvePositionManagerId(row.position));
  }

  return ordered;
}

export type SyncManagersResult = {
  managerId: string | null;
  secondLineManagerId: string | null;
  changed: boolean;
};

/**
 * Set managerId + secondLineManagerId from sub-department managers (reporting structure).
 */
export async function syncEmployeeManagersFromSubDepartments(
  userId: string,
): Promise<SyncManagersResult> {
  const managerIds = await resolveSubDepartmentManagerIds(userId);
  const nextManagerId = managerIds[0] ?? null;
  const nextSecond = managerIds[1] ?? null;

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { managerId: true, secondLineManagerId: true },
  });

  if (!existing) {
    return { managerId: nextManagerId, secondLineManagerId: nextSecond, changed: false };
  }

  if (managerIds.length === 0) {
    return {
      managerId: existing.managerId,
      secondLineManagerId: existing.secondLineManagerId,
      changed: false,
    };
  }

  const changed =
    existing.managerId !== nextManagerId ||
    existing.secondLineManagerId !== nextSecond;

  if (changed) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        managerId: nextManagerId,
        secondLineManagerId: nextSecond,
      },
    });
  }

  return { managerId: nextManagerId, secondLineManagerId: nextSecond, changed };
}

export async function findEmployeeUserIdsForSubDepartment(subDepartmentId: string): Promise<string[]> {
  const subDept = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    include: {
      department: { select: { name: true } },
      positions: { select: { id: true, name: true } },
    },
  });
  if (!subDept) return [];

  const ids = new Set<string>();
  const positionIds = subDept.positions.map((p) => p.id);
  const positionNames = subDept.positions.map((p) => p.name);
  const deptNames = [subDept.name, subDept.department?.name].filter(Boolean) as string[];

  if (positionIds.length > 0) {
    const assigned = await prisma.employeePositionAssignment.findMany({
      where: { positionId: { in: positionIds } },
      select: { userId: true },
    });
    for (const row of assigned) ids.add(row.userId);
  }

  if (positionNames.length > 0 && deptNames.length > 0) {
    const orClauses = positionNames.flatMap((name) =>
      deptNames.map((dept) => ({
        position: { equals: name, mode: 'insensitive' as const },
        department: { equals: dept, mode: 'insensitive' as const },
      })),
    );
    const primaryMatches = await prisma.user.findMany({
      where: { OR: orClauses },
      select: { id: true },
    });
    for (const row of primaryMatches) ids.add(row.id);
  }

  return [...ids];
}

export async function syncEmployeesForSubDepartment(subDepartmentId: string): Promise<number> {
  const userIds = await findEmployeeUserIdsForSubDepartment(subDepartmentId);
  let count = 0;
  for (const userId of userIds) {
    const result = await syncEmployeeManagersFromSubDepartments(userId);
    if (result.changed) count += 1;
  }
  return count;
}
