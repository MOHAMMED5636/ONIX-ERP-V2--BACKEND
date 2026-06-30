import prisma from '../config/database';
import { buildCompanyScopedUserFilter } from '../utils/attendance-manual-entry';
import { resolveEmployeeCompanyRecords } from './companyAccess.service';

type CompanyPick = { id: string; name: string; parentCompanyId: string | null };

function pickCompanyByPattern(companies: CompanyPick[], pattern: RegExp): string | null {
  return companies.find((c) => pattern.test(c.name))?.name ?? null;
}

/** Infer branch from employee number when profile company is blank. */
export function inferCompanyFromEmployeeNo(
  employeeNo: string | null | undefined,
  companies: CompanyPick[],
): string | null {
  const id = employeeNo?.trim().toUpperCase();
  if (!id) return null;
  if (id.startsWith('SY-')) return pickCompanyByPattern(companies, /syria/i);
  if (id.startsWith('AD-')) return pickCompanyByPattern(companies, /abu\s*dhabi/i);
  if (/^(E-|D-|O-|OP-)/.test(id)) return pickCompanyByPattern(companies, /dubai/i);
  return null;
}

/**
 * Resolve display company for payroll lines (profile, org scope, access grants, employee no.).
 */
export async function resolvePayrollLineCompanyNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  const result = new Map<string, string>();
  if (!uniqueIds.length) return result;

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, parentCompanyId: true },
    orderBy: { name: 'asc' },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, company: true, employeeId: true },
  });

  for (const user of users) {
    if (user.company?.trim()) {
      result.set(user.id, user.company.trim());
    }
  }

  const branches = companies.filter((c) => c.parentCompanyId != null);
  const parents = companies.filter((c) => c.parentCompanyId == null);
  const companyOrder = [...branches, ...parents];

  for (const company of companyOrder) {
    const filter = await buildCompanyScopedUserFilter(company.id);
    if (!filter) continue;
    const matched = await prisma.user.findMany({
      where: { AND: [{ id: { in: uniqueIds } }, filter] },
      select: { id: true },
    });
    for (const m of matched) {
      if (!result.has(m.id)) {
        result.set(m.id, company.name);
      }
    }
  }

  const grants = await prisma.userCompanyAccess.findMany({
    where: { userId: { in: uniqueIds } },
    include: { company: { select: { name: true } } },
  });
  for (const grant of grants) {
    if (!result.has(grant.userId)) {
      result.set(grant.userId, grant.company.name);
    }
  }

  for (const user of users) {
    if (result.has(user.id)) continue;
    const inferred = inferCompanyFromEmployeeNo(user.employeeId, companies);
    if (inferred) {
      result.set(user.id, inferred);
    }
  }

  for (const user of users) {
    if (result.has(user.id)) continue;
    const records = await resolveEmployeeCompanyRecords(user.id);
    if (records.length > 0) {
      result.set(user.id, records[0].name);
    }
  }

  return result;
}

export async function listPayrollCompanyOptions(): Promise<string[]> {
  const companies = await prisma.company.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return companies.map((c) => c.name);
}
