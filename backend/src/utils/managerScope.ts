import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export function getEffectiveRole(userRole: string | undefined): string | undefined {
  return userRole === 'SUPER_ADMIN' ? 'ADMIN' : userRole;
}

/** Project managers and managers are scoped to their assigned contracts (and related data). */
export function requiresAssignedManagerScope(effectiveRole: string | undefined): boolean {
  return effectiveRole === 'MANAGER' || effectiveRole === 'PROJECT_MANAGER';
}

export function buildAssignedManagerFilter(req: AuthRequest): Array<
  { assignedManagerEmail: string } | { assignedManagerId: string }
> {
  return [
    { assignedManagerEmail: req.user!.email! },
    { assignedManagerId: req.user!.id! },
  ];
}

export function isContractAssignedToUser(
  contract: { assignedManagerEmail: string | null; assignedManagerId: string | null },
  req: AuthRequest,
): boolean {
  const email = req.user?.email;
  const id = req.user?.id;
  if (!email || !id) return false;
  return contract.assignedManagerEmail === email || contract.assignedManagerId === id;
}

function parseSelectedClientIds(value: unknown): string[] {
  if (value == null || value === '') return [];
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      const t = String(raw).trim();
      return t ? [t] : [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  raw.forEach((item) => {
    if (typeof item === 'string' && item.trim()) ids.push(item.trim());
    else if (item && typeof item === 'object') {
      const id = (item as { id?: string }).id;
      if (id && String(id).trim()) ids.push(String(id).trim());
    }
  });
  return ids;
}

/** Client IDs linked to contracts assigned to the logged-in manager / project manager. */
export async function getClientIdsForAssignedManager(req: AuthRequest): Promise<string[]> {
  const contracts = await prisma.contract.findMany({
    where: { OR: buildAssignedManagerFilter(req) },
    select: { clientId: true, selectedClients: true },
  });

  const ids = new Set<string>();
  for (const c of contracts) {
    if (c.clientId) ids.add(c.clientId);
    parseSelectedClientIds(c.selectedClients).forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

export type ManagerClientScope = {
  denied: boolean;
  clientIds: string[] | null;
};

export async function resolveManagerClientScope(req: AuthRequest): Promise<ManagerClientScope> {
  const effectiveRole = getEffectiveRole(req.user?.role);
  if (!requiresAssignedManagerScope(effectiveRole)) {
    return { denied: false, clientIds: null };
  }
  if (!req.user?.id || !req.user?.email) {
    return { denied: true, clientIds: [] };
  }
  const clientIds = await getClientIdsForAssignedManager(req);
  return { denied: false, clientIds };
}

/** Merge manager client scope into an existing Prisma `where` (search/filters preserved). */
export function applyManagerClientFilter(where: Record<string, unknown>, clientIds: string[]): void {
  const scopeClause = { id: { in: clientIds } };
  const rest = { ...where };
  Object.keys(where).forEach((key) => delete where[key]);
  where.AND = [scopeClause, rest];
}
