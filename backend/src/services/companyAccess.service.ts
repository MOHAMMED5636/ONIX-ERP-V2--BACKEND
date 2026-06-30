import prisma from '../config/database';
import { Prisma, UserRole } from '@prisma/client';
import { buildCompanyNameAliases, buildCompanyScopeAliases } from '../utils/company-name-aliases';

export type AccessibleCompany = {
  id: string;
  name: string;
  tag: string | null;
  branchName: string | null;
  address: string | null;
  logo: string | null;
};

export type CompanyAccessScope = {
  unrestricted: boolean;
  companyIds: string[];
  companies: AccessibleCompany[];
};

const SCOPED_ROLES = new Set<string>([UserRole.ADMIN, UserRole.HR]);

export function roleUsesCompanyAccessScope(role: string | undefined): boolean {
  return role != null && SCOPED_ROLES.has(role);
}

function locationHints(location: string | null | undefined): string[] {
  const loc = String(location ?? '').trim().toLowerCase();
  if (!loc) return [];
  const hints: string[] = [loc];
  if (loc.includes('dubai') || loc.includes('dubi')) hints.push('dubai', 'onix dubai');
  if (loc.includes('abu') && loc.includes('dhabi')) hints.push('abu dhabi', 'onix ad');
  if (loc.includes('syria') || loc.includes('idlib')) hints.push('syria', 'idlib', 'onix syr');
  return [...new Set(hints)];
}

function companyMatchesLocation(
  c: { name: string; tag: string | null; branchName: string | null; address: string | null },
  hints: string[],
): boolean {
  if (!hints.length) return true;
  const hay = [c.name, c.tag, c.branchName, c.address].filter(Boolean).join(' ').toLowerCase();
  return hints.some((h) => hay.includes(h));
}

function nameMatchesUserCompany(
  companyName: string,
  parentName: string | null | undefined,
  userCompany: string,
): boolean {
  const userAliases = buildCompanyNameAliases(userCompany);
  const scopeAliases = buildCompanyScopeAliases(companyName, parentName);
  return scopeAliases.some((sa) => userAliases.some((ua) => ua.toLowerCase() === sa.toLowerCase()));
}

/**
 * Resolve org Company rows for an employee/manager from profile `company` + `companyLocation`
 * (handles parent vs branch names, e.g. ONIX ENGINEERING CONSULTANCY + Dubai HQ → Dubai branch).
 */
export async function resolveEmployeeCompanyRecords(userId: string): Promise<AccessibleCompany[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { company: true, companyLocation: true },
  });
  const userCompany = user?.company?.trim() ?? '';
  if (!userCompany) return [];

  const all = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      tag: true,
      branchName: true,
      address: true,
      logo: true,
      parentCompany: { select: { name: true } },
    },
  });

  let candidates = all.filter((c) =>
    nameMatchesUserCompany(c.name, c.parentCompany?.name ?? null, userCompany),
  );

  const hints = locationHints(user?.companyLocation);
  if (candidates.length > 1 && hints.length > 0) {
    const narrowed = candidates.filter((c) => companyMatchesLocation(c, hints));
    if (narrowed.length > 0) candidates = narrowed;
  }

  return candidates.map(({ parentCompany: _p, ...c }) => c);
}

/**
 * Whether an employee's User.company text can be assigned to an org position under positionCompanyName.
 * Allows same company, parent↔branch, and sibling branches under one parent (Load from Employee Directory).
 */
export async function employeeCompanyCompatibleWithPositionCompany(
  userCompany: string,
  positionCompanyName: string,
): Promise<boolean> {
  const empCompany = userCompany.trim();
  const posName = positionCompanyName.trim();
  if (!empCompany || !posName) return false;

  const directAliases = buildCompanyScopeAliases(posName);
  const empAliases = buildCompanyNameAliases(empCompany);
  if (
    directAliases.some((da) =>
      empAliases.some((ea) => ea.toLowerCase() === da.toLowerCase()),
    )
  ) {
    return true;
  }

  const posAliases = buildCompanyNameAliases(posName);
  const positionCompany = await prisma.company.findFirst({
    where: {
      OR: posAliases.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })),
    },
    select: {
      id: true,
      name: true,
      parentCompanyId: true,
      parentCompany: { select: { id: true, name: true } },
    },
  });

  if (!positionCompany) {
    return false;
  }

  const rootId = positionCompany.parentCompanyId ?? positionCompany.id;
  const [groupCompanies, rootCompany] = await Promise.all([
    prisma.company.findMany({
      where: {
        OR: [{ id: rootId }, { parentCompanyId: rootId }],
      },
      select: {
        name: true,
        parentCompany: { select: { name: true } },
      },
    }),
    prisma.company.findUnique({
      where: { id: rootId },
      select: { name: true },
    }),
  ]);

  const rootName = positionCompany.parentCompany?.name ?? rootCompany?.name ?? null;

  for (const c of groupCompanies) {
    const parentName = c.parentCompany?.name ?? rootName;
    if (nameMatchesUserCompany(c.name, parentName, empCompany)) {
      return true;
    }
  }

  return nameMatchesUserCompany(
    positionCompany.name,
    positionCompany.parentCompany?.name,
    empCompany,
  );
}

const accessibleCompanySelect = {
  id: true,
  name: true,
  tag: true,
  branchName: true,
  address: true,
  logo: true,
} as const;

/** Companies linked to org-chart position assignments for this user. */
async function resolveCompaniesFromOrgPositionAssignments(
  userId: string,
): Promise<AccessibleCompany[]> {
  const assignments = await prisma.employeePositionAssignment.findMany({
    where: { userId },
    select: {
      position: {
        select: {
          subDepartment: {
            select: {
              department: {
                select: { company: { select: accessibleCompanySelect } },
              },
            },
          },
        },
      },
    },
  });

  const byId = new Map<string, AccessibleCompany>();
  for (const row of assignments) {
    const company = row.position?.subDepartment?.department?.company;
    if (company) byId.set(company.id, company);
  }
  return Array.from(byId.values());
}

function mergeAccessibleCompanies(...lists: AccessibleCompany[][]): AccessibleCompany[] {
  const byId = new Map<string, AccessibleCompany>();
  for (const list of lists) {
    for (const c of list) byId.set(c.id, c);
  }
  return Array.from(byId.values());
}

/** Grant ERP company visibility when a user is assigned to an org-chart position (e.g. Syria branch HR). */
export async function grantCompanyAccessForOrgPosition(
  userId: string,
  positionId: string,
  grantedById?: string | null,
): Promise<void> {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: {
      subDepartment: {
        select: { department: { select: { companyId: true } } },
      },
    },
  });
  const companyId = position?.subDepartment?.department?.companyId;
  if (!companyId) return;

  await prisma.userCompanyAccess.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: {
      userId,
      companyId,
      grantedById: grantedById ?? null,
    },
    update: {},
  });
}

/** SUPER_ADMIN: all companies. ADMIN/HR: assigned companies only. */
export async function resolveCompanyAccessScope(
  userId: string,
  userRole: string | undefined,
): Promise<CompanyAccessScope> {
  if (userRole === UserRole.SUPER_ADMIN) {
    return { unrestricted: true, companyIds: [], companies: [] };
  }

  if (!roleUsesCompanyAccessScope(userRole)) {
    return { unrestricted: false, companyIds: [], companies: [] };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { company: true, companyLocation: true },
  });

  const explicit = await prisma.userCompanyAccess.findMany({
    where: { userId },
    include: {
      company: {
        select: { id: true, name: true, tag: true, branchName: true, address: true, logo: true },
      },
    },
  });

  if (explicit.length > 0) {
    const orgCompanies = await resolveCompaniesFromOrgPositionAssignments(userId);
    const companies = mergeAccessibleCompanies(
      explicit.map((row) => row.company),
      orgCompanies,
    );
    return {
      unrestricted: false,
      companyIds: companies.map((c) => c.id),
      companies,
    };
  }

  const userCompany = user?.company?.trim() ?? '';
  if (!userCompany) {
    return { unrestricted: false, companyIds: [], companies: [] };
  }

  const all = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      tag: true,
      branchName: true,
      address: true,
      logo: true,
      parentCompany: { select: { name: true } },
    },
  });

  let candidates = all.filter((c) =>
    nameMatchesUserCompany(c.name, c.parentCompany?.name ?? null, userCompany),
  );

  const orgCompanies = await resolveCompaniesFromOrgPositionAssignments(userId);

  const hints = locationHints(user?.companyLocation);
  if (candidates.length > 1 && hints.length > 0) {
    const narrowed = candidates.filter((c) => companyMatchesLocation(c, hints));
    if (narrowed.length > 0) candidates = narrowed;
  }

  const companies = mergeAccessibleCompanies(
    candidates.map(({ parentCompany: _p, ...c }) => c),
    orgCompanies,
  );
  return {
    unrestricted: false,
    companyIds: companies.map((c) => c.id),
    companies,
  };
}

export async function assertCanAccessCompany(
  userId: string,
  userRole: string | undefined,
  companyId: string,
): Promise<boolean> {
  const scope = await resolveCompanyAccessScope(userId, userRole);
  if (scope.unrestricted) return true;
  if (scope.companyIds.includes(companyId)) return true;
  const employeeCompanies = await resolveEmployeeCompanyRecords(userId);
  return employeeCompanies.some((c) => c.id === companyId);
}

export function prismaCompanyWhereFromScope(scope: CompanyAccessScope): Prisma.CompanyWhereInput {
  if (scope.unrestricted) return {};
  if (scope.companyIds.length === 0) return { id: { in: [] } };
  return { id: { in: scope.companyIds } };
}

/** Resolve all User.company string aliases covered by accessible companies. */
export async function resolveCompanyNameAliasesForScope(
  scope: CompanyAccessScope,
): Promise<string[]> {
  if (scope.unrestricted) return [];
  const names = new Set<string>();
  for (const brief of scope.companies) {
    const row = await prisma.company.findUnique({
      where: { id: brief.id },
      select: {
        name: true,
        parentCompany: { select: { name: true } },
      },
    });
    if (!row) continue;
    buildCompanyScopeAliases(row.name, row.parentCompany?.name).forEach((a) => {
      if (a.trim()) names.add(a.trim());
    });
  }
  return Array.from(names);
}

/** Prisma filter for employees belonging to accessible companies (User.company text). */
export async function buildEmployeeWhereForCompanyScope(
  scope: CompanyAccessScope,
): Promise<Prisma.UserWhereInput | undefined> {
  if (scope.unrestricted) return undefined;
  const aliases = await resolveCompanyNameAliasesForScope(scope);
  if (aliases.length === 0) return { id: { in: [] } };
  return {
    OR: aliases.map((n) => ({ company: { equals: n, mode: 'insensitive' as const } })),
  };
}

export async function countActiveEmployeesForScope(scope: CompanyAccessScope): Promise<number> {
  const employeeWhere = await buildEmployeeWhereForCompanyScope(scope);
  return prisma.user.count({
    where: {
      role: { notIn: [UserRole.TENDER_ENGINEER] },
      isActive: true,
      ...(employeeWhere ?? {}),
    },
  });
}

/** HR/Admin: ensure target employee belongs to actor's assigned companies (Super Admin bypasses). */
export async function assertEmployeeInCompanyScope(
  employeeId: string,
  actorId: string,
  actorRole: string | undefined,
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const scope = await resolveCompanyAccessScope(actorId, actorRole);
  if (scope.unrestricted) return { ok: true };

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, company: true },
  });
  if (!employee) {
    return { ok: false, message: 'Employee not found', status: 404 };
  }

  const aliases = await resolveCompanyNameAliasesForScope(scope);
  if (aliases.length === 0) {
    return { ok: false, message: 'Forbidden: no company access assigned', status: 403 };
  }

  const empCompany = (employee.company || '').trim().toLowerCase();
  if (!empCompany) {
    return {
      ok: false,
      message: 'Forbidden: this employee is not linked to a company in your scope',
      status: 403,
    };
  }

  const allowed = aliases.some((a) => a.toLowerCase() === empCompany);
  if (!allowed) {
    return {
      ok: false,
      message: 'Forbidden: this employee is outside your assigned companies',
      status: 403,
    };
  }

  return { ok: true };
}
