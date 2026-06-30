import prisma from '../config/database';
import {
  CompanyPolicyStatus,
  PolicyAssignmentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { resolveEmployeeCompanyRecords } from './companyAccess.service';
import { logPolicyAudit, POLICY_AUDIT_ACTIONS } from './companyPolicyAudit.service';

function parseDepartmentList(raw: string | null | undefined): string[] {
  const text = String(raw || '').trim();
  if (!text || text === 'All Departments' || text === 'General') return [];
  return text.split(',').map((p) => p.trim()).filter(Boolean);
}

function normalizeRole(r: string): string {
  return String(r || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

async function userMatchesPolicyAudience(
  user: {
    id: string;
    role: UserRole;
    department: string | null;
    isActive: boolean;
  },
  policy: {
    companyId: string | null;
    department: string;
    assignRoles: string[];
    assignUserIds: string[];
  },
): Promise<boolean> {
  if (!user.isActive) return false;

  if (policy.assignUserIds.length > 0) {
    return policy.assignUserIds.includes(user.id);
  }

  if (policy.companyId) {
    const companies = await resolveEmployeeCompanyRecords(user.id);
    if (!companies.some((c) => c.id === policy.companyId)) return false;
  }

  if (policy.assignRoles.length > 0) {
    const userRole = normalizeRole(user.role);
    const allowed = policy.assignRoles.map(normalizeRole);
    if (!allowed.includes(userRole)) return false;
  }

  const targetDepartments = parseDepartmentList(policy.department);
  if (targetDepartments.length === 0) return true;

  const userDept = String(user.department || '').trim().toLowerCase();
  if (!userDept) return false;
  return targetDepartments.some((d) => d.toLowerCase() === userDept);
}

export async function materializePolicyAssignments(policyId: string): Promise<number> {
  const policy = await prisma.companyPolicy.findUnique({ where: { id: policyId } });
  if (!policy) return 0;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, role: true, department: true, isActive: true },
  });

  const dueAt =
    policy.dueDays != null && policy.dueDays > 0
      ? new Date(Date.now() + policy.dueDays * 24 * 60 * 60 * 1000)
      : null;

  let created = 0;
  for (const user of users) {
    const matches = await userMatchesPolicyAudience(user, policy);
    if (!matches) continue;

    await prisma.companyPolicyAssignment.upsert({
      where: { policyId_userId: { policyId, userId: user.id } },
      create: {
        policyId,
        userId: user.id,
        status: PolicyAssignmentStatus.NOT_VIEWED,
        dueAt,
      },
      update: {
        dueAt: dueAt ?? undefined,
      },
    });
    created += 1;
  }

  if (created > 0) {
    await logPolicyAudit({
      policyId,
      action: POLICY_AUDIT_ACTIONS.POLICY_ASSIGNED,
      policyTitle: policy.title,
      metadata: { assignedCount: created },
    });
  }

  return created;
}

export async function syncAcknowledgementsToAssignments(policyId: string): Promise<void> {
  const acks = await prisma.companyPolicyAcknowledgement.findMany({
    where: { policyId },
  });
  for (const ack of acks) {
    await prisma.companyPolicyAssignment.upsert({
      where: { policyId_userId: { policyId, userId: ack.userId } },
      create: {
        policyId,
        userId: ack.userId,
        status: PolicyAssignmentStatus.ACKNOWLEDGED,
        acknowledgedAt: ack.acknowledgedAt,
      },
      update: {
        status: PolicyAssignmentStatus.ACKNOWLEDGED,
        acknowledgedAt: ack.acknowledgedAt,
      },
    });
  }
}

export async function publishCompanyPolicy(policyId: string, actorId: string): Promise<void> {
  const policy = await prisma.companyPolicy.findUnique({ where: { id: policyId } });
  if (!policy) throw new Error('Policy not found');

  await prisma.companyPolicy.update({
    where: { id: policyId },
    data: {
      status: CompanyPolicyStatus.PUBLISHED,
      isActive: true,
      publishDate: policy.publishDate ?? new Date(),
    },
  });

  await materializePolicyAssignments(policyId);
  await syncAcknowledgementsToAssignments(policyId);

  await logPolicyAudit({
    policyId,
    actorId,
    action: POLICY_AUDIT_ACTIONS.POLICY_PUBLISHED,
    policyTitle: policy.title,
  });
}

export async function userHasPolicyAssignment(userId: string, policyId: string): Promise<boolean> {
  const count = await prisma.companyPolicyAssignment.count({
    where: { policyId, userId },
  });
  return count > 0;
}

export async function updateAssignmentOnView(
  policyId: string,
  userId: string,
): Promise<void> {
  const row = await prisma.companyPolicyAssignment.findUnique({
    where: { policyId_userId: { policyId, userId } },
  });
  if (!row || row.acknowledgedAt) return;
  if (row.viewedAt) return;

  await prisma.companyPolicyAssignment.update({
    where: { policyId_userId: { policyId, userId } },
    data: {
      viewedAt: new Date(),
      status: row.downloadedAt ? PolicyAssignmentStatus.DOWNLOADED : PolicyAssignmentStatus.VIEWED,
    },
  });
}

export async function updateAssignmentOnDownload(
  policyId: string,
  userId: string,
): Promise<void> {
  const row = await prisma.companyPolicyAssignment.findUnique({
    where: { policyId_userId: { policyId, userId } },
  });
  const now = new Date();
  if (row) {
    await prisma.companyPolicyAssignment.update({
      where: { policyId_userId: { policyId, userId } },
      data: {
        downloadedAt: now,
        viewedAt: row.viewedAt ?? now,
        status: row.acknowledgedAt ? PolicyAssignmentStatus.ACKNOWLEDGED : PolicyAssignmentStatus.DOWNLOADED,
      },
    });
    return;
  }
  await prisma.companyPolicyAssignment.create({
    data: {
      policyId,
      userId,
      viewedAt: now,
      downloadedAt: now,
      status: PolicyAssignmentStatus.DOWNLOADED,
    },
  });
}

export async function updateAssignmentOnAcknowledge(
  policyId: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  await prisma.companyPolicyAssignment.upsert({
    where: { policyId_userId: { policyId, userId } },
    create: {
      policyId,
      userId,
      viewedAt: now,
      acknowledgedAt: now,
      status: PolicyAssignmentStatus.ACKNOWLEDGED,
    },
    update: {
      acknowledgedAt: now,
      viewedAt: { set: now },
      status: PolicyAssignmentStatus.ACKNOWLEDGED,
    },
  });
}

export type AuditDashboardStats = {
  totalPolicies: number;
  activePolicies: number;
  expiredPolicies: number;
  totalEmployees: number;
  acknowledged: number;
  pending: number;
  overdue: number;
  compliancePercent: number;
};

export async function getAuditDashboardStats(): Promise<AuditDashboardStats> {
  const [totalPolicies, activePolicies, expiredPolicies, totalEmployees, assignments] =
    await Promise.all([
      prisma.companyPolicy.count({ where: { isActive: true } }),
      prisma.companyPolicy.count({
        where: { isActive: true, status: CompanyPolicyStatus.PUBLISHED },
      }),
      prisma.companyPolicy.count({
        where: { status: CompanyPolicyStatus.EXPIRED },
      }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.companyPolicyAssignment.findMany({
        select: { status: true, acknowledgedAt: true },
      }),
    ]);

  const acknowledged = assignments.filter((a) => a.acknowledgedAt != null).length;
  const overdue = assignments.filter((a) => a.status === PolicyAssignmentStatus.OVERDUE).length;
  const pending = assignments.length - acknowledged - overdue;
  const compliancePercent =
    assignments.length > 0 ? Math.round((acknowledged / assignments.length) * 1000) / 10 : 0;

  return {
    totalPolicies,
    activePolicies,
    expiredPolicies,
    totalEmployees,
    acknowledged,
    pending: Math.max(0, pending),
    overdue,
    compliancePercent,
  };
}

export async function getPerPolicyCompliance(
  filters: { search?: string; page?: number; limit?: number } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const skip = (page - 1) * limit;

  const where: Prisma.CompanyPolicyWhereInput = { isActive: true };
  if (filters.search?.trim()) {
    where.title = { contains: filters.search.trim(), mode: 'insensitive' };
  }

  const [policies, total] = await Promise.all([
    prisma.companyPolicy.findMany({
      where,
      orderBy: { publishDate: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        publishDate: true,
        expiryDate: true,
        department: true,
      },
    }),
    prisma.companyPolicy.count({ where }),
  ]);

  const policyIds = policies.map((p) => p.id);
  const assignmentGroups = policyIds.length
    ? await prisma.companyPolicyAssignment.groupBy({
        by: ['policyId', 'status'],
        where: { policyId: { in: policyIds } },
        _count: { _all: true },
      })
    : [];

  const byPolicy = new Map<
    string,
    { assigned: number; viewed: number; acknowledged: number; pending: number; overdue: number }
  >();

  for (const p of policies) {
    byPolicy.set(p.id, { assigned: 0, viewed: 0, acknowledged: 0, pending: 0, overdue: 0 });
  }

  for (const g of assignmentGroups) {
    const bucket = byPolicy.get(g.policyId);
    if (!bucket) continue;
    const n = g._count._all;
    bucket.assigned += n;
    if (g.status === PolicyAssignmentStatus.ACKNOWLEDGED) bucket.acknowledged += n;
    else if (g.status === PolicyAssignmentStatus.OVERDUE) bucket.overdue += n;
    else if (
      g.status === PolicyAssignmentStatus.VIEWED ||
      g.status === PolicyAssignmentStatus.DOWNLOADED
    ) {
      bucket.viewed += n;
    } else {
      bucket.pending += n;
    }
  }

  const rows = policies.map((p) => {
    const stats = byPolicy.get(p.id) || {
      assigned: 0,
      viewed: 0,
      acknowledged: 0,
      pending: 0,
      overdue: 0,
    };
    const compliancePercent =
      stats.assigned > 0 ? Math.round((stats.acknowledged / stats.assigned) * 1000) / 10 : 0;
    return {
      ...p,
      publishDate: p.publishDate?.toISOString() ?? null,
      expiryDate: p.expiryDate?.toISOString() ?? null,
      totalAssigned: stats.assigned,
      totalViewed: stats.viewed,
      totalAcknowledged: stats.acknowledged,
      totalPending: stats.pending,
      totalOverdue: stats.overdue,
      compliancePercent,
    };
  });

  return { rows, total, page, limit };
}

export async function getPerEmployeeCompliance(
  filters: {
    search?: string;
    department?: string;
    policyId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const skip = (page - 1) * limit;

  const where: Prisma.CompanyPolicyAssignmentWhereInput = {};
  if (filters.policyId) where.policyId = filters.policyId;
  if (filters.status) where.status = filters.status as PolicyAssignmentStatus;
  if (filters.department?.trim() || filters.search?.trim()) {
    where.user = {};
    if (filters.department?.trim()) {
      where.user.department = { equals: filters.department.trim(), mode: 'insensitive' };
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.user.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.companyPolicyAssignment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { assignedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeId: true,
            department: true,
          },
        },
        policy: { select: { id: true, title: true, publishDate: true, expiryDate: true } },
      },
    }),
    prisma.companyPolicyAssignment.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      policyId: r.policyId,
      policyTitle: r.policy.title,
      userId: r.userId,
      employeeName: `${r.user.firstName} ${r.user.lastName}`.trim() || r.user.email,
      employeeId: r.user.employeeId,
      department: r.user.department,
      assignedAt: r.assignedAt.toISOString(),
      viewedAt: r.viewedAt?.toISOString() ?? null,
      downloadedAt: r.downloadedAt?.toISOString() ?? null,
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      status: r.status,
      reminderCount: r.reminderCount,
      lastReminderAt: r.lastReminderAt?.toISOString() ?? null,
      policyPublishDate: r.policy.publishDate?.toISOString() ?? null,
    })),
    total,
    page,
    limit,
  };
}
