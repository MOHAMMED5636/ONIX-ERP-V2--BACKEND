import prisma from '../config/database';
import { CompanyAttachmentCategory } from '@prisma/client';
import { emitErpNotification } from './erpNotification.service';
import { sendBrowserPushToUsers } from './browserPush.service';
import { buildCompanyScopeAliases } from '../utils/company-name-aliases';
import { getScopedProjectIds } from './dashboard.service';

/** Reminder thresholds (days before expiry, plus 0 = expired). */
export const EXPIRY_REMINDER_THRESHOLDS = [90, 60, 30, 15, 7, 3, 1, 0] as const;

export type ExpiryStatusColor = 'green' | 'yellow' | 'orange' | 'red' | 'black';
export type ExpiryStatusLabel =
  | 'ok'
  | 'warning'
  | 'attention'
  | 'urgent'
  | 'expired';

export type ExpiryRecord = {
  id: string;
  sourceType: 'employee' | 'company' | 'company_attachment' | 'hr_document' | 'project_document';
  sourceKey: string;
  entityId: string;
  entityLabel: string;
  companyId: string | null;
  companyName: string | null;
  branchName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  projectId?: string | null;
  projectName?: string | null;
  referenceCode?: string | null;
  documentType: string;
  expiresAt: string;
  daysLeft: number;
  status: ExpiryStatusLabel;
  statusColor: ExpiryStatusColor;
};

export type ExpiryUserContext = {
  userId?: string;
  userRole?: string;
};

export type ExpiryFilters = {
  companyId?: string;
  branchName?: string;
  employeeId?: string;
  documentType?: string;
  expiringThisWeek?: boolean;
  expiringThisMonth?: boolean;
  alreadyExpired?: boolean;
  maxDays?: number;
  search?: string;
};

type AccessScope = {
  mode: 'all' | 'company' | 'self' | 'admin_personal' | 'hr_employees' | 'all_employees';
  companyNames: string[];
  companyIds: string[];
  userId?: string;
};

/** Resolved company dropdown filter — matches employee directory branch logic. */
type CompanyFilterContext = {
  filterCompanyId: string;
  companyIds: Set<string>;
  employeeCompanyAliases: string[];
};

async function resolveCompanyFilterContext(
  filters: ExpiryFilters,
): Promise<CompanyFilterContext | null> {
  const filterCompanyId = filters.companyId?.trim();
  if (!filterCompanyId) return null;

  const company = await prisma.company.findUnique({
    where: { id: filterCompanyId },
    select: { id: true, name: true, parentCompanyId: true },
  });

  if (!company) {
    return {
      filterCompanyId,
      companyIds: new Set([filterCompanyId]),
      employeeCompanyAliases: [],
    };
  }

  let parentName: string | null = null;
  const companyIds = new Set<string>([filterCompanyId, company.id]);

  if (company.parentCompanyId) {
    const parent = await prisma.company.findUnique({
      where: { id: company.parentCompanyId },
      select: { id: true, name: true },
    });
    parentName = parent?.name ?? null;
    if (parent?.id) companyIds.add(parent.id);
  }

  const employeeCompanyAliases = buildCompanyScopeAliases(company.name, parentName);

  if (employeeCompanyAliases.length) {
    const aliasCompanies = await prisma.company.findMany({
      where: {
        OR: employeeCompanyAliases.map((n) => ({
          name: { equals: n, mode: 'insensitive' as const },
        })),
      },
      select: { id: true },
    });
    aliasCompanies.forEach((c) => companyIds.add(c.id));
  }

  return { filterCompanyId, companyIds, employeeCompanyAliases };
}

function employeeMatchesCompanyFilter(
  emp: { company: string | null },
  ctx: CompanyFilterContext | null,
): boolean {
  if (!ctx) return true;
  const empCompany = (emp.company || '').trim().toLowerCase();
  if (!empCompany) return false;
  return ctx.employeeCompanyAliases.some((a) => a.toLowerCase() === empCompany);
}

function companyMatchesCompanyFilter(companyId: string, ctx: CompanyFilterContext | null): boolean {
  if (!ctx) return true;
  return ctx.companyIds.has(companyId);
}

const EMPLOYEE_DOC_FIELDS: { field: keyof Pick<
  import('@prisma/client').User,
  | 'passportExpiryDate'
  | 'nationalIdExpiryDate'
  | 'residencyExpiryDate'
  | 'labourIdExpiryDate'
  | 'drivingLicenseExpiryDate'
  | 'insuranceExpiryDate'
>; label: string }[] = [
  { field: 'passportExpiryDate', label: 'Passport' },
  { field: 'residencyExpiryDate', label: 'Visa' },
  { field: 'nationalIdExpiryDate', label: 'Emirates ID' },
  { field: 'labourIdExpiryDate', label: 'Labour Card / Work Permit' },
  { field: 'drivingLicenseExpiryDate', label: 'Driving License' },
  { field: 'insuranceExpiryDate', label: 'Insurance Documents' },
];

const COMPANY_DOC_FIELDS: { field: keyof Pick<
  import('@prisma/client').Company,
  | 'licenseExpiry'
  | 'emiratesIdExpiry'
  | 'membershipExpiry'
  | 'molCardExpiry'
  | 'practiceRegisterExpiry'
  | 'prequalificationExpiry'
  | 'subscriptionExpiryDate'
>; label: string }[] = [
  { field: 'licenseExpiry', label: 'Trade License' },
  { field: 'emiratesIdExpiry', label: 'Establishment Card' },
  { field: 'membershipExpiry', label: 'Chamber of Commerce Certificate' },
  { field: 'molCardExpiry', label: 'MOL Card' },
  { field: 'practiceRegisterExpiry', label: 'Professional License' },
  { field: 'prequalificationExpiry', label: 'Prequalification Certificate' },
  { field: 'subscriptionExpiryDate', label: 'Subscription / VAT Certificate' },
];

const ATTACHMENT_CATEGORY_LABELS: Record<CompanyAttachmentCategory, string> = {
  TRADE_LICENSE: 'Trade License',
  EJARI: 'Ejari',
  MEMORANDUM_OF_ASSOCIATION: 'Memorandum of Association',
  ESTABLISHMENT_CARD: 'Establishment Card',
  BANK_DETAILS: 'Corporate Bank Documents',
  TAX_REGISTRATION: 'VAT Certificate',
  INSURANCE: 'Insurance Policy',
  COMPANY_IDENTITY: 'Company Identity',
  ISO_CERTIFICATE: 'Professional License (ISO)',
  OTHER_CERTIFICATION: 'Custom Company Document',
};

/** Labels for project-list attachment document types (PRJ module). */
const PROJECT_DOC_TYPE_LABELS: Record<string, string> = {
  'PRJ:CNTR': 'Project Contract',
  'PRJ:UND': 'Undertaking Letter',
  'PRJ:DRW': 'Drawing / CAD',
  'PRJ:RPT': 'Report',
  'PRJ:SUP': 'Supervision Form',
  'PRJ:MOM': 'Minutes of Meeting',
  'PRJ:CORR': 'Correspondence / Letters',
  'PRJ:APP': 'Approval Documents',
  'PRJ:PERM': 'Permits',
  'PRJ:INSP': 'Inspection Reports',
  'PRJ:TECH': 'Technical Specifications',
  'PRJ:SITE': 'Site Photos',
  'PRJ:COST': 'Cost Estimation',
  'PRJ:SCHED': 'Project Schedule',
  'PRJ:RISK': 'Risk Assessment',
  'PRJ:QUAL': 'Quality Control',
  'PRJ:ENV': 'Environmental',
  'PRJ:SAFE': 'Safety Documents',
  'PRJ:DESIGN': 'Design Documents',
  'PRJ:CONSTRUCTION': 'Construction',
};

function formatProjectDocumentType(module: string, documentType: string, fileName: string): string {
  const key = `${module}:${documentType}`;
  if (PROJECT_DOC_TYPE_LABELS[key]) return PROJECT_DOC_TYPE_LABELS[key];
  if (documentType && !['DOC', 'OTHER', 'XXX'].includes(documentType.toUpperCase())) {
    return documentType;
  }
  return fileName || 'Project Attachment';
}

function isManagerLikeRole(role?: string): boolean {
  const r = String(role || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return r === 'MANAGER' || r === 'PROJECT_MANAGER';
}

function shouldCollectProjectDocuments(scope: AccessScope, ctx?: ExpiryUserContext): boolean {
  if (scope.mode === 'all') return true;
  if (ctx?.userId && isManagerLikeRole(ctx.userRole)) return true;
  return false;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysUntilExpiry(expiresAt: Date, now = new Date()): number {
  const ms = startOfDay(expiresAt).getTime() - startOfDay(now).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function getExpiryStatus(daysLeft: number): {
  status: ExpiryStatusLabel;
  statusColor: ExpiryStatusColor;
} {
  if (daysLeft < 0) return { status: 'expired', statusColor: 'black' };
  if (daysLeft <= 6) return { status: 'urgent', statusColor: 'red' };
  if (daysLeft <= 29) return { status: 'attention', statusColor: 'orange' };
  if (daysLeft <= 60) return { status: 'warning', statusColor: 'yellow' };
  return { status: 'ok', statusColor: 'green' };
}

function buildRecord(partial: Omit<ExpiryRecord, 'daysLeft' | 'status' | 'statusColor' | 'expiresAt'> & { expiresAt: string | Date }): ExpiryRecord {
  const expiresAtDate = partial.expiresAt instanceof Date ? partial.expiresAt : new Date(partial.expiresAt);
  const daysLeft = daysUntilExpiry(expiresAtDate);
  const { status, statusColor } = getExpiryStatus(daysLeft);
  return {
    ...partial,
    expiresAt: expiresAtDate.toISOString(),
    daysLeft,
    status,
    statusColor,
  };
}

function matchesFilters(record: ExpiryRecord, filters: ExpiryFilters): boolean {
  if (filters.branchName && (record.branchName || '').toLowerCase() !== filters.branchName.toLowerCase()) {
    return false;
  }
  if (filters.employeeId && record.employeeId !== filters.employeeId) return false;
  if (filters.documentType) {
    const q = filters.documentType.toLowerCase();
    if (!record.documentType.toLowerCase().includes(q)) return false;
  }
  if (filters.alreadyExpired && record.daysLeft >= 0) return false;
  if (filters.expiringThisWeek && (record.daysLeft < 0 || record.daysLeft > 7)) return false;
  if (filters.expiringThisMonth && (record.daysLeft < 0 || record.daysLeft > 30)) return false;
  if (filters.maxDays != null && record.daysLeft > filters.maxDays) return false;
  if (filters.search) {
    const hay = [
      record.entityLabel,
      record.companyName,
      record.employeeName,
      record.documentType,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}

async function resolveCompanyNamesForScope(scope: AccessScope): Promise<string[]> {
  if (scope.mode === 'all') return [];
  if (!scope.companyNames.length && !scope.companyIds.length) return [];

  const names = new Set<string>();
  for (const cn of scope.companyNames) {
    buildCompanyScopeAliases(cn, null).forEach((a) => names.add(a.trim()));
  }

  if (scope.companyIds.length) {
    const rows = await prisma.company.findMany({
      where: { id: { in: scope.companyIds } },
      select: { id: true, name: true, branchName: true, parentCompanyId: true },
    });
    for (const row of rows) {
      if (row.name) names.add(row.name.trim());
      const branches = await prisma.company.findMany({
        where: { parentCompanyId: row.id },
        select: { name: true },
      });
      branches.forEach((b) => b.name && names.add(b.name.trim()));
    }
  }

  const aliasList = Array.from(names);
  if (aliasList.length) {
    const matched = await prisma.company.findMany({
      where: {
        OR: aliasList.map((n) => ({
          name: { equals: n, mode: 'insensitive' as const },
        })),
      },
      select: { id: true, name: true, parentCompanyId: true },
    });
    for (const row of matched) {
      if (row.name) names.add(row.name.trim());
      let parentName: string | null = null;
      if (row.parentCompanyId) {
        const parent = await prisma.company.findUnique({
          where: { id: row.parentCompanyId },
          select: { name: true },
        });
        parentName = parent?.name ?? null;
        if (parentName) names.add(parentName.trim());
      }
      buildCompanyScopeAliases(row.name, parentName).forEach((a) => names.add(a.trim()));
      const branches = await prisma.company.findMany({
        where: { parentCompanyId: row.id },
        select: { name: true },
      });
      branches.forEach((b) => b.name && names.add(b.name.trim()));
    }
  }

  return Array.from(names);
}

export function resolveAccessScope(role: string, user: { id: string; company?: string | null }): AccessScope {
  if (role === 'SUPER_ADMIN') {
    return { mode: 'all', companyNames: [], companyIds: [] };
  }
  if (role === 'EMPLOYEE') {
    return { mode: 'self', companyNames: [], companyIds: [], userId: user.id };
  }
  if (role === 'ADMIN') {
    const companyName = user.company?.trim();
    return {
      mode: 'admin_personal',
      companyNames: companyName ? [companyName] : [],
      companyIds: [],
      userId: user.id,
    };
  }
  if (role === 'MANAGER' || role === 'PROJECT_MANAGER') {
    return {
      mode: 'admin_personal',
      companyNames: [],
      companyIds: [],
      userId: user.id,
    };
  }
  if (role === 'HR') {
    const companyName = user.company?.trim();
    if (!companyName) {
      return { mode: 'all_employees', companyNames: [], companyIds: [] };
    }
    return { mode: 'hr_employees', companyNames: [companyName], companyIds: [] };
  }
  return { mode: 'company', companyNames: user.company?.trim() ? [user.company.trim()] : [], companyIds: [] };
}

/** Async scope for Admin/HR using explicit company assignments. */
export async function resolveAccessScopeForUser(
  role: string,
  user: { id: string; company?: string | null },
): Promise<AccessScope> {
  if (role === 'ADMIN' || role === 'HR') {
    const { resolveCompanyAccessScope, resolveCompanyNameAliasesForScope } = await import(
      './companyAccess.service'
    );
    const access = await resolveCompanyAccessScope(user.id, role);
    if (!access.unrestricted) {
      const aliases = await resolveCompanyNameAliasesForScope(access);
      if (role === 'HR') {
        return {
          mode: 'hr_employees',
          companyNames: aliases,
          companyIds: access.companyIds,
        };
      }
      return {
        mode: 'admin_personal',
        companyNames: aliases,
        companyIds: access.companyIds,
        userId: user.id,
      };
    }
  }
  return resolveAccessScope(role, user);
}

async function employeeMatchesScope(
  employee: { id: string; company: string | null },
  scope: AccessScope,
  companyNames: string[],
): Promise<boolean> {
  if (scope.mode === 'all' || scope.mode === 'all_employees') return true;
  if (scope.mode === 'self' || scope.mode === 'admin_personal') {
    return employee.id === scope.userId;
  }
  const empCompany = (employee.company || '').trim().toLowerCase();
  if (!empCompany) return false;
  return companyNames.some((n) => n.toLowerCase() === empCompany);
}

async function collectEmployeeExpiries(scope: AccessScope, filters: ExpiryFilters): Promise<ExpiryRecord[]> {
  const companyNames = await resolveCompanyNamesForScope(scope);
  const companyFilter = await resolveCompanyFilterContext(filters);

  const where: Record<string, unknown> = { isActive: true, role: { notIn: ['TENDER_ENGINEER'] } };
  if ((scope.mode === 'self' || scope.mode === 'admin_personal') && scope.userId) {
    where.id = scope.userId;
  }

  if (companyFilter?.employeeCompanyAliases.length) {
    where.OR = companyFilter.employeeCompanyAliases.map((n) => ({
      company: { equals: n, mode: 'insensitive' },
    }));
  }

  const employees = await prisma.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      companyLocation: true,
      passportExpiryDate: true,
      nationalIdExpiryDate: true,
      residencyExpiryDate: true,
      labourIdExpiryDate: true,
      drivingLicenseExpiryDate: true,
      insuranceExpiryDate: true,
    },
  });

  const labourDetails = await prisma.labourDetails.findMany({
    where: { userId: { in: employees.map((e) => e.id) } },
    select: {
      userId: true,
      healthInsuranceExpiryDate: true,
      vehicleRegistrationExpiry: true,
      accommodationContractExpiry: true,
    },
  });
  const labourByUser = new Map(labourDetails.map((l) => [l.userId, l]));

  const records: ExpiryRecord[] = [];

  for (const emp of employees) {
    if (!(await employeeMatchesScope(emp, scope, companyNames))) continue;
    if (!employeeMatchesCompanyFilter(emp, companyFilter)) continue;

    const employeeName = `${emp.firstName} ${emp.lastName}`.trim();
    const companyName = emp.company?.trim() || null;
    const branchName = emp.companyLocation?.trim() || null;

    const companyId = companyFilter?.filterCompanyId ?? null;

    for (const { field, label } of EMPLOYEE_DOC_FIELDS) {
      const date = emp[field];
      if (!date) continue;
      const sourceKey = `employee:${emp.id}:${field}`;
      records.push(
        buildRecord({
          id: sourceKey,
          sourceType: 'employee',
          sourceKey,
          entityId: emp.id,
          entityLabel: employeeName,
          companyId,
          companyName,
          branchName,
          employeeId: emp.id,
          employeeName,
          documentType: label,
          expiresAt: date,
        }),
      );
    }

    const labour = labourByUser.get(emp.id);
    if (labour) {
      const extra: { date: Date | null; label: string; key: string }[] = [
        { date: labour.healthInsuranceExpiryDate, label: 'Health Insurance', key: 'healthInsuranceExpiryDate' },
        { date: labour.vehicleRegistrationExpiry, label: 'Vehicle Registration', key: 'vehicleRegistrationExpiry' },
        { date: labour.accommodationContractExpiry, label: 'Accommodation Contract', key: 'accommodationContractExpiry' },
      ];
      for (const item of extra) {
        if (!item.date) continue;
        const sourceKey = `employee:${emp.id}:labour:${item.key}`;
        records.push(
          buildRecord({
            id: sourceKey,
            sourceType: 'employee',
            sourceKey,
            entityId: emp.id,
            entityLabel: employeeName,
            companyId,
            companyName,
            branchName,
            employeeId: emp.id,
            employeeName,
            documentType: item.label,
            expiresAt: item.date,
          }),
        );
      }
    }
  }

  const hrDocs = await prisma.document.findMany({
    where: {
      module: 'HR',
      expiresAt: { not: null },
      ...((scope.mode === 'self' || scope.mode === 'admin_personal') && scope.userId
        ? { entityCode: { in: employees.map((e) => e.id) } }
        : {}),
    },
    select: {
      id: true,
      entityCode: true,
      documentType: true,
      fileName: true,
      expiresAt: true,
    },
  });

  for (const doc of hrDocs) {
    if (!doc.expiresAt) continue;
    const emp = employees.find((e) => e.id === doc.entityCode);
    if (!emp) continue;
    if (!(await employeeMatchesScope(emp, scope, companyNames))) continue;
    if (!employeeMatchesCompanyFilter(emp, companyFilter)) continue;

    const employeeName = `${emp.firstName} ${emp.lastName}`.trim();
    const companyName = emp.company?.trim() || null;
    const displayCompanyId = companyFilter?.filterCompanyId ?? null;
    const sourceKey = `hr_document:${doc.id}`;

    records.push(
      buildRecord({
        id: sourceKey,
        sourceType: 'hr_document',
        sourceKey,
        entityId: doc.id,
        entityLabel: employeeName,
        companyId: displayCompanyId,
        companyName,
        branchName: emp.companyLocation?.trim() || null,
        employeeId: emp.id,
        employeeName,
        documentType: doc.documentType || doc.fileName || 'Custom Employee Document',
        expiresAt: doc.expiresAt,
      }),
    );
  }

  return records.filter((r) => matchesFilters(r, filters));
}

async function companyMatchesScope(
  company: { id: string; name: string; parentCompanyId: string | null },
  scope: AccessScope,
  companyNames: string[],
): Promise<boolean> {
  if (scope.mode === 'all') return true;
  if (scope.mode === 'self') return false;
  const name = company.name.trim().toLowerCase();
  return companyNames.some((n) => n.toLowerCase() === name);
}

async function collectCompanyExpiries(scope: AccessScope, filters: ExpiryFilters): Promise<ExpiryRecord[]> {
  if (scope.mode === 'self' || scope.mode === 'hr_employees' || scope.mode === 'all_employees') return [];

  const companyNames = await resolveCompanyNamesForScope(scope);
  const companyFilter = await resolveCompanyFilterContext(filters);
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      branchName: true,
      parentCompanyId: true,
      licenseExpiry: true,
      emiratesIdExpiry: true,
      membershipExpiry: true,
      molCardExpiry: true,
      practiceRegisterExpiry: true,
      prequalificationExpiry: true,
      subscriptionExpiryDate: true,
    },
  });

  const records: ExpiryRecord[] = [];

  for (const company of companies) {
    if (!(await companyMatchesScope(company, scope, companyNames))) continue;
    if (!companyMatchesCompanyFilter(company.id, companyFilter)) continue;

    for (const { field, label } of COMPANY_DOC_FIELDS) {
      const date = company[field];
      if (!date) continue;
      const sourceKey = `company:${company.id}:${field}`;
      records.push(
        buildRecord({
          id: sourceKey,
          sourceType: 'company',
          sourceKey,
          entityId: company.id,
          entityLabel: company.name,
          companyId: company.id,
          companyName: company.name,
          branchName: company.branchName,
          employeeId: null,
          employeeName: null,
          documentType: label,
          expiresAt: date,
        }),
      );
    }
  }

  const attachments = await prisma.companyAttachment.findMany({
    where: { expiresAt: { not: null } },
    select: {
      id: true,
      companyId: true,
      category: true,
      label: true,
      fileName: true,
      expiresAt: true,
      company: { select: { id: true, name: true, branchName: true, parentCompanyId: true } },
    },
  });

  for (const att of attachments) {
    if (!att.expiresAt) continue;
    if (!(await companyMatchesScope(att.company, scope, companyNames))) continue;
    if (!companyMatchesCompanyFilter(att.companyId, companyFilter)) continue;

    const docLabel =
      att.label?.trim() ||
      ATTACHMENT_CATEGORY_LABELS[att.category] ||
      att.fileName ||
      'Company Document';
    const sourceKey = `company_attachment:${att.id}`;
    records.push(
      buildRecord({
        id: sourceKey,
        sourceType: 'company_attachment',
        sourceKey,
        entityId: att.id,
        entityLabel: att.company.name,
        companyId: att.companyId,
        companyName: att.company.name,
        branchName: att.company.branchName,
        employeeId: null,
        employeeName: null,
        documentType: docLabel,
        expiresAt: att.expiresAt,
      }),
    );
  }

  return records.filter((r) => matchesFilters(r, filters));
}

async function collectProjectDocumentExpiries(
  scope: AccessScope,
  filters: ExpiryFilters,
  ctx?: ExpiryUserContext,
): Promise<ExpiryRecord[]> {
  if (!shouldCollectProjectDocuments(scope, ctx)) return [];

  let scopedIds: string[] | null = null;

  if (scope.mode === 'all') {
    scopedIds = null;
  } else if (ctx?.userId && isManagerLikeRole(ctx.userRole)) {
    scopedIds = await getScopedProjectIds(ctx.userId, ctx.userRole);
    if (!scopedIds.length) return [];
  } else {
    return [];
  }

  const projectWhere: Record<string, unknown> = { deletedAt: null };
  if (scopedIds?.length) {
    projectWhere.id = { in: scopedIds };
  }

  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: { id: true, name: true, referenceNumber: true },
  });

  if (!projects.length && scopedIds?.length) return [];

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const refNumbers = projects.map((p) => p.referenceNumber).filter(Boolean);
  const refSet = new Set(refNumbers);

  const docWhere: Record<string, unknown> = {
    expiresAt: { not: null },
    module: { not: 'HR' },
  };

  if (scopedIds?.length) {
    docWhere.OR = [
      { projectId: { in: scopedIds } },
      ...(refNumbers.length ? [{ entityCode: { in: refNumbers } }] : []),
    ];
  } else {
    docWhere.OR = [{ projectId: { not: null } }, { module: 'PRJ' }];
  }

  const docs = await prisma.document.findMany({
    where: docWhere,
    select: {
      id: true,
      module: true,
      entityCode: true,
      documentType: true,
      fileName: true,
      expiresAt: true,
      projectId: true,
      referenceCode: true,
    },
  });

  const missingRefs = [
    ...new Set(
      docs
        .filter((d) => !d.projectId && d.entityCode && !refSet.has(d.entityCode))
        .map((d) => d.entityCode),
    ),
  ];
  if (missingRefs.length) {
    const extraProjects = await prisma.project.findMany({
      where: { referenceNumber: { in: missingRefs }, deletedAt: null },
      select: { id: true, name: true, referenceNumber: true },
    });
    for (const p of extraProjects) {
      projectById.set(p.id, p);
      refSet.add(p.referenceNumber);
    }
  }

  const records: ExpiryRecord[] = [];

  for (const doc of docs) {
    if (!doc.expiresAt) continue;

    let project =
      (doc.projectId ? projectById.get(doc.projectId) : null) ||
      projects.find((p) => p.referenceNumber === doc.entityCode) ||
      null;

    if (!project && doc.entityCode) {
      project = [...projectById.values()].find((p) => p.referenceNumber === doc.entityCode) ?? null;
    }

    const projectId = project?.id ?? doc.projectId ?? null;

    if (scopedIds?.length) {
      const inScopeById = projectId != null && scopedIds.includes(projectId);
      const inScopeByRef = Boolean(doc.entityCode && refSet.has(doc.entityCode));
      if (!inScopeById && !inScopeByRef) continue;
    }

    const docLabel = formatProjectDocumentType(doc.module, doc.documentType, doc.fileName);
    const sourceKey = `project_document:${doc.id}`;

    records.push(
      buildRecord({
        id: sourceKey,
        sourceType: 'project_document',
        sourceKey,
        entityId: doc.id,
        entityLabel: project?.name || doc.entityCode || doc.referenceCode,
        companyId: null,
        companyName: null,
        branchName: null,
        employeeId: null,
        employeeName: null,
        projectId,
        projectName: project?.name ?? null,
        referenceCode: doc.referenceCode,
        documentType: docLabel,
        expiresAt: doc.expiresAt,
      }),
    );
  }

  return records.filter((r) => matchesFilters(r, filters));
}

export async function getAllExpiryRecords(
  scope: AccessScope,
  filters: ExpiryFilters = {},
  ctx?: ExpiryUserContext,
): Promise<{ employees: ExpiryRecord[]; companies: ExpiryRecord[]; projectDocuments: ExpiryRecord[] }> {
  const employeeFilters: ExpiryFilters =
    scope.mode === 'self' || scope.mode === 'admin_personal'
      ? { ...filters, maxDays: undefined }
      : filters;
  const attachmentFilters: ExpiryFilters = { maxDays: 90, ...filters };

  const [employeeRecords, companyRecords, projectRecords] = await Promise.all([
    collectEmployeeExpiries(scope, employeeFilters),
    collectCompanyExpiries(scope, attachmentFilters),
    collectProjectDocumentExpiries(scope, attachmentFilters, ctx),
  ]);

  const sortFn = (a: ExpiryRecord, b: ExpiryRecord) => a.daysLeft - b.daysLeft || a.documentType.localeCompare(b.documentType);

  return {
    employees: employeeRecords.sort(sortFn),
    companies: companyRecords.sort(sortFn),
    projectDocuments: projectRecords.sort(sortFn),
  };
}

export async function getExpirySummary(
  scope: AccessScope,
  ctx?: ExpiryUserContext,
): Promise<{
  total: number;
  expired: number;
  urgent: number;
  attention: number;
  warning: number;
  upcoming: ExpiryRecord[];
}> {
  const { employees, companies, projectDocuments } = await getAllExpiryRecords(scope, {}, ctx);
  const all = [...employees, ...companies, ...projectDocuments].sort(
    (a, b) => a.daysLeft - b.daysLeft || a.documentType.localeCompare(b.documentType),
  );
  return {
    total: all.length,
    expired: all.filter((r) => r.status === 'expired').length,
    urgent: all.filter((r) => r.status === 'urgent').length,
    attention: all.filter((r) => r.status === 'attention').length,
    warning: all.filter((r) => r.status === 'warning').length,
    upcoming: all.slice(0, scope.mode === 'self' ? 100 : 50),
  };
}

function formatNotificationMessage(record: ExpiryRecord, thresholdDays: number): string {
  if (thresholdDays === 0 || record.daysLeft < 0) {
    if (record.sourceType === 'employee' || record.sourceType === 'hr_document') {
      return `${record.employeeName}'s ${record.documentType} has expired.`;
    }
    if (record.sourceType === 'project_document') {
      return `${record.projectName || record.entityLabel} — ${record.documentType} has expired.`;
    }
    return `${record.companyName}'s ${record.documentType} has expired.`;
  }
  const days = record.daysLeft;
  if (record.sourceType === 'employee' || record.sourceType === 'hr_document') {
    return `${record.employeeName}'s ${record.documentType} expires in ${days} day${days === 1 ? '' : 's'}.`;
  }
  if (record.sourceType === 'project_document') {
    return `${record.projectName || record.entityLabel} — ${record.documentType} expires in ${days} day${days === 1 ? '' : 's'}.`;
  }
  return `${record.companyName}'s ${record.documentType} expires in ${days} day${days === 1 ? '' : 's'}.`;
}

async function getNotificationRecipients(record: ExpiryRecord): Promise<string[]> {
  const ids = new Set<string>();

  if (record.employeeId) {
    ids.add(record.employeeId);
  }

  const superAdmins = await prisma.user.findMany({
    where: { isActive: true, role: 'SUPER_ADMIN' },
    select: { id: true },
  });
  superAdmins.forEach((u) => ids.add(u.id));

  const isEmployeeDoc = record.sourceType === 'employee' || record.sourceType === 'hr_document';
  const isProjectDoc = record.sourceType === 'project_document';
  const staffRoles = isEmployeeDoc ? (['HR'] as const) : (['ADMIN'] as const);

  const staffWhere: Record<string, unknown> = {
    isActive: true,
    role: { in: [...staffRoles] },
  };

  if (record.companyName) {
    staffWhere.company = { equals: record.companyName, mode: 'insensitive' };
  }

  const staffUsers = await prisma.user.findMany({
    where: staffWhere,
    select: { id: true },
  });
  staffUsers.forEach((u) => ids.add(u.id));

  if (isProjectDoc && record.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: record.projectId },
      select: {
        createdBy: true,
        contracts: { select: { assignedManagerId: true } },
        assignedEmployees: { select: { employeeId: true } },
      },
    });
    if (project?.createdBy) ids.add(project.createdBy);
    project?.contracts.forEach((c) => {
      if (c.assignedManagerId) ids.add(c.assignedManagerId);
    });
    const managers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['MANAGER', 'PROJECT_MANAGER'] } },
      select: { id: true },
    });
    managers.forEach((u) => ids.add(u.id));
  }

  return Array.from(ids);
}

function thresholdForDaysLeft(daysLeft: number): number | null {
  if (daysLeft < 0) return 0;
  for (const t of EXPIRY_REMINDER_THRESHOLDS) {
    if (daysLeft === t) return t;
  }
  return null;
}

export async function processDocumentExpiryReminders(now = new Date()): Promise<number> {
  const scope: AccessScope = { mode: 'all', companyNames: [], companyIds: [] };
  const { employees, companies, projectDocuments } = await getAllExpiryRecords(scope);
  const all = [...employees, ...companies, ...projectDocuments];
  let sent = 0;

  for (const record of all) {
    const threshold = thresholdForDaysLeft(record.daysLeft);
    if (threshold == null) continue;

    const recipients = await getNotificationRecipients(record);
    const message = formatNotificationMessage(record, threshold);
    const title =
      threshold === 0 || record.daysLeft < 0
        ? 'Document expired'
        : `Document expiry in ${record.daysLeft} day${record.daysLeft === 1 ? '' : 's'}`;

    for (const recipientUserId of recipients) {
      const existing = await prisma.documentExpiryNotificationLog.findUnique({
        where: {
          recipientUserId_sourceKey_thresholdDays: {
            recipientUserId,
            sourceKey: record.sourceKey,
            thresholdDays: threshold,
          },
        },
      });
      if (existing) continue;

      const notifId = `doc-expiry-${record.sourceKey}-${threshold}-${recipientUserId}`;
      emitErpNotification(recipientUserId, {
        id: notifId,
        type: 'document_expiry',
        title,
        message,
        read: false,
        createdAt: now.toISOString(),
        status: record.status,
        requesterName: record.employeeName || record.companyName || undefined,
        expiresAt: record.expiresAt,
      });

      await sendBrowserPushToUsers([recipientUserId], {
        title,
        body: message,
        url: '/document-expiry',
      }).catch(() => {});

      await prisma.documentExpiryNotificationLog.create({
        data: {
          recipientUserId,
          sourceKey: record.sourceKey,
          thresholdDays: threshold,
        },
      });
      sent += 1;
    }
  }

  return sent;
}
