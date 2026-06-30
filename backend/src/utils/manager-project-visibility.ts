import prisma from '../config/database';
import { ProjectStatus } from '@prisma/client';

/** Strict PM name match — full name and "First L" initial only (matches project list UI). */
export function buildManagerNameVariations(
  firstName?: string | null,
  lastName?: string | null,
): string[] {
  const managerFirstName = firstName?.trim().toLowerCase() || '';
  const managerLastName = lastName?.trim().toLowerCase() || '';
  const managerFullName = `${managerFirstName} ${managerLastName}`.trim();
  const out: string[] = [];
  if (managerFullName) out.push(managerFullName);
  if (managerFirstName && managerLastName) {
    out.push(`${managerFirstName} ${managerLastName.charAt(0)}`);
  }
  return out;
}

/**
 * Prisma OR conditions for projects a manager/PM owns (same rules as Main Table list).
 * Contract-assigned PM is source of truth; legacy text match only when no contract PM.
 */
export function buildManagerProjectListWhere(
  userId: string,
  email: string | null | undefined,
  managerNameVariations: string[],
): Record<string, unknown>[] {
  const orConditions: Record<string, unknown>[] = [];

  orConditions.push({ contracts: { some: { assignedManagerId: userId } } });
  if (email) {
    orConditions.push({ contracts: { some: { assignedManagerEmail: email } } });
  }

  if (managerNameVariations.length > 0) {
    orConditions.push({
      AND: [
        {
          NOT: {
            contracts: {
              some: {
                OR: [
                  { assignedManagerId: { not: null } },
                  { assignedManagerEmail: { not: null } },
                ],
              },
            },
          },
        },
        {
          OR: managerNameVariations.map((name) => ({
            projectManager: { contains: name, mode: 'insensitive' as const },
          })),
        },
      ],
    });
  }

  return orConditions;
}

export async function buildManagerProjectVisibilityOr(
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  const managerUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true },
  });
  return buildManagerProjectListWhere(
    userId,
    managerUser?.email ?? null,
    buildManagerNameVariations(managerUser?.firstName, managerUser?.lastName),
  );
}

export function isManagerLikeRole(userRole?: string): boolean {
  const normalized = String(userRole || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return normalized === 'MANAGER' || normalized === 'PROJECT_MANAGER';
}

/** Statuses treated as "active" on dashboard — aligned with projects still in PM workflow. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.OPEN,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.SUBMITTED_IN_PROGRESS,
];
