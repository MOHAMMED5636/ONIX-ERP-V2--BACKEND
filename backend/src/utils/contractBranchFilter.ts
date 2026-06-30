import prisma from '../config/database';
import type { CompanyAccessScope } from '../services/companyAccess.service';

/** Match contracts stored with companyId and/or legacy companyName text. */
export async function buildContractBranchFilter(
  companyId: string,
): Promise<Record<string, unknown>> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  const branchOr: Record<string, unknown>[] = [{ companyId }];
  if (company?.name?.trim()) {
    branchOr.push({ companyName: { equals: company.name.trim(), mode: 'insensitive' } });
  }
  return branchOr.length === 1 ? branchOr[0] : { OR: branchOr };
}

async function contractBranchFiltersForScope(
  scope: CompanyAccessScope,
): Promise<Record<string, unknown>[]> {
  return Promise.all(scope.companyIds.map((companyId) => buildContractBranchFilter(companyId)));
}

/** Projects visible when at least one linked contract belongs to an accessible branch. */
export async function buildProjectWhereForCompanyScope(
  scope: CompanyAccessScope,
): Promise<Record<string, unknown>> {
  if (scope.unrestricted) return {};
  if (scope.companyIds.length === 0) {
    return { contracts: { some: { id: { in: [] } } } };
  }
  const branchFilters = await contractBranchFiltersForScope(scope);
  const contractWhere =
    branchFilters.length === 1 ? branchFilters[0] : { OR: branchFilters };
  return { contracts: { some: contractWhere } };
}

export async function projectMatchesCompanyScope(
  projectId: string,
  scope: CompanyAccessScope,
): Promise<boolean> {
  if (scope.unrestricted) return true;
  if (scope.companyIds.length === 0) return false;
  const branchFilters = await contractBranchFiltersForScope(scope);
  const contractWhere =
    branchFilters.length === 1 ? branchFilters[0] : { OR: branchFilters };
  const hit = await prisma.contract.findFirst({
    where: { projectId, ...(contractWhere as Record<string, unknown>) },
    select: { id: true },
  });
  return Boolean(hit);
}

export function mergeProjectScopeIntoWhere(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown>,
): void {
  if (!scopeClause || Object.keys(scopeClause).length === 0) return;
  if (Array.isArray(where.AND)) {
    where.AND.push(scopeClause);
    return;
  }
  if (Object.keys(where).length === 0) {
    Object.assign(where, scopeClause);
    return;
  }
  const rest = { ...where };
  Object.keys(where).forEach((key) => delete where[key]);
  where.AND = [scopeClause, rest];
}

/** Client IDs that have at least one contract on the given branch. */
export async function getClientIdsForCompanyBranch(companyId: string): Promise<string[]> {
  const branchFilter = await buildContractBranchFilter(companyId);
  const rows = await prisma.contract.findMany({
    where: {
      AND: [branchFilter, { clientId: { not: null } }],
    },
    select: { clientId: true },
    distinct: ['clientId'],
  });
  return rows.map((r) => r.clientId!).filter(Boolean);
}

export function mergeClientIdScope(
  where: Record<string, unknown>,
  clientIds: string[],
): void {
  const scopeClause = {
    id: { in: clientIds.length ? clientIds : ['00000000-0000-4000-8000-000000000000'] },
  };
  if (Array.isArray(where.AND)) {
    where.AND.push(scopeClause);
    return;
  }
  if (Object.keys(where).length === 0) {
    Object.assign(where, scopeClause);
    return;
  }
  const rest = { ...where };
  Object.keys(where).forEach((key) => delete where[key]);
  where.AND = [scopeClause, rest];
}

/** Filter clients assigned to branch directly or via contracts on that branch. */
export function mergeClientBranchFilter(
  where: Record<string, unknown>,
  companyId: string,
  contractClientIds: string[],
): void {
  const orClauses: Record<string, unknown>[] = [{ companyId }];
  if (contractClientIds.length > 0) {
    orClauses.push({ id: { in: contractClientIds } });
  }
  const branchClause = orClauses.length === 1 ? orClauses[0] : { OR: orClauses };

  if (Array.isArray(where.AND)) {
    where.AND.push(branchClause);
    return;
  }
  if (Object.keys(where).length === 0) {
    Object.assign(where, branchClause);
    return;
  }
  const rest = { ...where };
  Object.keys(where).forEach((key) => delete where[key]);
  where.AND = [branchClause, rest];
}
