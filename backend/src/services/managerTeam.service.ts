import prisma from '../config/database';
import { Prisma, TaskStatus } from '@prisma/client';
import { resolveEmployeeCompanyRecords } from './companyAccess.service';
import { buildCompanyNameAliases } from '../utils/company-name-aliases';

export function isManagerWorkloadRole(role: string | undefined): boolean {
  return role === 'MANAGER' || role === 'PROJECT_MANAGER';
}

export async function getManagerNameVariations(managerUserId: string): Promise<string[]> {
  const u = await prisma.user.findUnique({
    where: { id: managerUserId },
    select: { firstName: true, lastName: true },
  });
  if (!u) return [];
  const first = u.firstName?.trim().toLowerCase() || '';
  const last = u.lastName?.trim().toLowerCase() || '';
  const vars = new Set<string>();
  if (first) vars.add(first);
  if (last) vars.add(last);
  if (first && last) {
    vars.add(`${first} ${last}`);
    vars.add(`${first} ${last.charAt(0)}`);
  }
  return [...vars];
}

/** Project IDs this manager owns or leads (matches project list scoping). */
export async function getManagerProjectIds(
  managerUserId: string,
  managerEmail?: string | null,
): Promise<string[]> {
  const nameVars = await getManagerNameVariations(managerUserId);
  const orConditions: Prisma.ProjectWhereInput[] = [{ createdBy: managerUserId }];

  if (managerEmail) {
    orConditions.push({
      contracts: { some: { assignedManagerEmail: managerEmail } },
    });
  }
  orConditions.push({
    contracts: { some: { assignedManagerId: managerUserId } },
  });

  if (nameVars.length > 0) {
    orConditions.push({
      OR: nameVars.map((name) => ({
        projectManager: { contains: name, mode: 'insensitive' },
      })),
    });
  }

  const projects = await prisma.project.findMany({
    where: { OR: orConditions, deletedAt: null },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}

/**
 * Org hierarchy team: direct reports + departments/positions/sub-departments they manage.
 */
export async function getManagedEmployeeIdsFromOrg(managerUserId: string): Promise<string[]> {
  const ids = new Set<string>();

  const direct = await prisma.user.findMany({
    where: { managerId: managerUserId, isActive: true },
    select: { id: true },
  });
  direct.forEach((u) => ids.add(u.id));

  const managedDepts = await prisma.department.findMany({
    where: { managerId: managerUserId },
    select: { name: true },
  });
  for (const d of managedDepts) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        department: { equals: d.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }

  const managedPositions = await prisma.position.findMany({
    where: { managerId: managerUserId },
    select: { name: true },
  });
  for (const p of managedPositions) {
    const name = p.name?.trim();
    if (!name) continue;
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        position: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }

  const managedSubDepts = await prisma.subDepartment.findMany({
    where: { managerId: managerUserId },
    select: { id: true },
  });
  for (const sd of managedSubDepts) {
    const positions = await prisma.position.findMany({
      where: { subDepartmentId: sd.id },
      select: { name: true },
    });
    for (const p of positions) {
      const name = p.name?.trim();
      if (!name) continue;
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          position: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      users.forEach((u) => ids.add(u.id));
    }
  }

  ids.delete(managerUserId);
  return [...ids];
}

/** Employees on this manager's projects (task assignees + project members). */
export async function getProjectTeamEmployeeIds(
  managerUserId: string,
  managerEmail?: string | null,
): Promise<string[]> {
  const projectIds = await getManagerProjectIds(managerUserId, managerEmail);
  if (projectIds.length === 0) return [];

  const ids = new Set<string>();

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      deletedAt: null,
    },
    select: {
      assignedEmployeeId: true,
      assignments: { select: { employeeId: true } },
    },
  });
  for (const t of tasks) {
    if (t.assignedEmployeeId) ids.add(t.assignedEmployeeId);
    for (const a of t.assignments) ids.add(a.employeeId);
  }

  const members = await prisma.projectAssignment.findMany({
    where: { projectId: { in: projectIds } },
    select: { employeeId: true },
  });
  for (const m of members) ids.add(m.employeeId);

  ids.delete(managerUserId);
  return [...ids];
}

export type ManagerProjectOption = {
  id: string;
  name: string;
  projectNumber: number | null;
  referenceNumber: string | null;
};

/** Projects this manager leads (for workload project filter). */
export async function getManagerProjects(
  managerUserId: string,
  managerEmail?: string | null,
): Promise<ManagerProjectOption[]> {
  const ids = await getManagerProjectIds(managerUserId, managerEmail);
  if (ids.length === 0) return [];
  return prisma.project.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      name: true,
      projectNumber: true,
      referenceNumber: true,
    },
    orderBy: [{ projectNumber: 'asc' }, { name: 'asc' }],
  });
}

/** Keep team members who have workload tasks or project membership on selected projects. */
export async function filterTeamIdsByProjects(
  teamIds: string[],
  projectIds: string[],
  activeTaskStatuses: TaskStatus[],
): Promise<string[]> {
  if (!projectIds.length || !teamIds.length) return teamIds;
  const allowed = new Set<string>();

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      deletedAt: null,
      status: { in: activeTaskStatuses },
      OR: [
        { assignedEmployeeId: { in: teamIds } },
        { assignments: { some: { employeeId: { in: teamIds } } } },
      ],
    },
    select: {
      assignedEmployeeId: true,
      assignments: { where: { employeeId: { in: teamIds } }, select: { employeeId: true } },
    },
  });
  for (const t of tasks) {
    if (t.assignedEmployeeId) allowed.add(t.assignedEmployeeId);
    for (const a of t.assignments) allowed.add(a.employeeId);
  }

  const members = await prisma.projectAssignment.findMany({
    where: { projectId: { in: projectIds }, employeeId: { in: teamIds } },
    select: { employeeId: true },
  });
  for (const m of members) allowed.add(m.employeeId);

  return teamIds.filter((id) => allowed.has(id));
}

/** Full team for workload: org hierarchy + project assignees. */
export async function getManagerTeamUserIds(
  managerUserId: string,
  managerEmail?: string | null,
): Promise<string[]> {
  const [orgIds, projectIds] = await Promise.all([
    getManagedEmployeeIdsFromOrg(managerUserId),
    getProjectTeamEmployeeIds(managerUserId, managerEmail),
  ]);
  const merged = new Set<string>([...orgIds, ...projectIds]);
  merged.delete(managerUserId);
  return [...merged];
}

export type PeerProjectManagerOption = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
};

function peerSharesCompanyContext(
  actorCompanyIds: Set<string>,
  actorCompanyText: string,
  peerCompanyRecords: Awaited<ReturnType<typeof resolveEmployeeCompanyRecords>>,
  peerCompanyText: string,
): boolean {
  if (
    actorCompanyIds.size > 0 &&
    peerCompanyRecords.some((record) => actorCompanyIds.has(record.id))
  ) {
    return true;
  }
  if (!actorCompanyText || !peerCompanyText) return false;
  const actorAliases = new Set(
    buildCompanyNameAliases(actorCompanyText).map((alias) => alias.toLowerCase()),
  );
  return buildCompanyNameAliases(peerCompanyText).some((alias) =>
    actorAliases.has(alias.toLowerCase()),
  );
}

/** Other project managers in the same company — for read-only peer workload viewing. */
export async function listPeerProjectManagersForWorkload(
  actorUserId: string,
): Promise<PeerProjectManagerOption[]> {
  const [actorRecords, actor] = await Promise.all([
    resolveEmployeeCompanyRecords(actorUserId),
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { company: true },
    }),
  ]);
  const actorCompanyIds = new Set(actorRecords.map((record) => record.id));
  const actorCompanyText = actor?.company?.trim() ?? '';

  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['MANAGER', 'PROJECT_MANAGER'] },
      id: { not: actorUserId },
    },
    select: { id: true, firstName: true, lastName: true, company: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  const peers: PeerProjectManagerOption[] = [];
  for (const candidate of candidates) {
    const peerRecords = await resolveEmployeeCompanyRecords(candidate.id);
    const peerCompanyText = candidate.company?.trim() ?? '';
    if (
      !peerSharesCompanyContext(actorCompanyIds, actorCompanyText, peerRecords, peerCompanyText)
    ) {
      continue;
    }
    const firstName = candidate.firstName?.trim() || '';
    const lastName = candidate.lastName?.trim() || '';
    peers.push({
      id: candidate.id,
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' ') || 'Project manager',
    });
  }
  return peers;
}

export async function resolvePeerProjectManagerView(
  actorUserId: string,
  viewAsProjectManagerId: string | undefined,
): Promise<{
  managerUserId: string;
  readOnly: boolean;
  viewingManager: PeerProjectManagerOption | null;
}> {
  const trimmed = viewAsProjectManagerId?.trim();
  if (!trimmed || trimmed === actorUserId) {
    return { managerUserId: actorUserId, readOnly: false, viewingManager: null };
  }

  const peers = await listPeerProjectManagersForWorkload(actorUserId);
  const target = peers.find((peer) => peer.id === trimmed);
  if (!target) {
    throw new Error('You cannot view that project manager\'s workload');
  }

  return {
    managerUserId: trimmed,
    readOnly: true,
    viewingManager: target,
  };
}
