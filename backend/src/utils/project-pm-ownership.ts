import { UserRole } from '@prisma/client';
import prisma from '../config/database';

export function buildUserNameVariations(firstName: unknown, lastName: unknown): string[] {
  const first = String(firstName || '').trim().toLowerCase();
  const last = String(lastName || '').trim().toLowerCase();
  const out = new Set<string>();
  if (first && last) {
    out.add(`${first} ${last}`.trim());
    out.add(`${first} ${last.charAt(0)}`.trim());
  } else if (first) {
    out.add(first);
  } else if (last) {
    out.add(last);
  }
  return Array.from(out).filter(Boolean);
}

function projectHasContractAssignedManager(project: { contracts?: unknown[] } | null | undefined): boolean {
  if (!Array.isArray(project?.contracts)) return false;
  return project.contracts.some((contract: any) => {
    return Boolean(contract?.assignedManagerId || contract?.assignedManagerEmail);
  });
}

function projectManagerTextMatches(projectManager: unknown, nameVariations: string[]): boolean {
  const pm = String(projectManager || '').trim().toLowerCase();
  if (!pm || !Array.isArray(nameVariations) || nameVariations.length === 0) return false;
  return nameVariations.some((name) => name && pm.includes(name));
}

export function managerOwnsProjectAsPm(
  project: any,
  manager: { id?: string | null; email?: string | null; nameVariations?: string[] },
): boolean {
  if (!project || !manager?.id) return false;

  const contractMatch = Array.isArray(project.contracts)
    ? project.contracts.some((contract: any) => {
        return (
          contract?.assignedManagerId === manager.id ||
          contract?.assignedManager?.id === manager.id ||
          (manager.email &&
            contract?.assignedManagerEmail &&
            String(contract.assignedManagerEmail).toLowerCase() === String(manager.email).toLowerCase())
        );
      })
    : false;
  if (contractMatch) return true;

  if (projectHasContractAssignedManager(project)) return false;

  return projectManagerTextMatches(project.projectManager, manager.nameVariations || []);
}

export async function resolveUserManagesProject(
  user: {
    id: string;
    role: UserRole;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
  projectId: string,
): Promise<boolean> {
  if (user.role === 'ADMIN' || user.role === 'HR' || user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'MANAGER' && user.role !== 'PROJECT_MANAGER') return false;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      contracts: {
        select: {
          assignedManagerId: true,
          assignedManagerEmail: true,
          assignedManager: { select: { id: true } },
        },
      },
    },
  });
  if (!project) return false;

  let firstName = user.firstName;
  let lastName = user.lastName;
  let email = user.email;
  if (firstName == null || lastName == null || email == null) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, firstName: true, lastName: true },
    });
    firstName = row?.firstName ?? firstName;
    lastName = row?.lastName ?? lastName;
    email = row?.email ?? email;
  }

  return managerOwnsProjectAsPm(project, {
    id: user.id,
    email,
    nameVariations: buildUserNameVariations(firstName, lastName),
  });
}
