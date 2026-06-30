import { Request } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { PolicyAssignmentStatus, Prisma } from '@prisma/client';

export const POLICY_AUDIT_ACTIONS = {
  POLICY_CREATED: 'POLICY_CREATED',
  POLICY_UPDATED: 'POLICY_UPDATED',
  POLICY_PUBLISHED: 'POLICY_PUBLISHED',
  POLICY_ARCHIVED: 'POLICY_ARCHIVED',
  POLICY_EXPIRED: 'POLICY_EXPIRED',
  POLICY_ASSIGNED: 'POLICY_ASSIGNED',
  POLICY_VIEWED: 'POLICY_VIEWED',
  POLICY_DOWNLOADED: 'POLICY_DOWNLOADED',
  POLICY_ACKNOWLEDGED: 'POLICY_ACKNOWLEDGED',
  REMINDER_SENT: 'REMINDER_SENT',
} as const;

export type PolicyAuditAction = (typeof POLICY_AUDIT_ACTIONS)[keyof typeof POLICY_AUDIT_ACTIONS];

export function extractRequestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null) ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 512) : null;
  return { ipAddress: ip, userAgent };
}

function userDisplayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null): string | null {
  if (!u) return null;
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return n || u.email || null;
}

export async function logPolicyAudit(
  input: {
    policyId?: string | null;
    userId?: string | null;
    actorId?: string | null;
    action: PolicyAuditAction | string;
    policyTitle?: string | null;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const subjectId = input.userId ?? input.actorId ?? null;
  let actorName: string | null = null;
  let employeeId: string | null = null;
  let department: string | null = null;

  const lookupId = input.actorId || subjectId;
  if (lookupId) {
    const u = await prisma.user.findUnique({
      where: { id: lookupId },
      select: { firstName: true, lastName: true, email: true, employeeId: true, department: true },
    });
    actorName = userDisplayName(u);
    if (input.userId) {
      const subj = input.userId === lookupId ? u : await prisma.user.findUnique({
        where: { id: input.userId },
        select: { employeeId: true, department: true, firstName: true, lastName: true, email: true },
      });
      employeeId = subj?.employeeId ?? null;
      department = subj?.department ?? null;
      if (!actorName && subj) actorName = userDisplayName(subj);
    } else {
      employeeId = u?.employeeId ?? null;
      department = u?.department ?? null;
    }
  }

  await prisma.companyPolicyAuditLog.create({
    data: {
      policyId: input.policyId ?? null,
      userId: input.userId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      actorName,
      employeeId,
      department,
      policyTitle: input.policyTitle ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function logPolicyAuditFromRequest(
  req: AuthRequest,
  input: Omit<Parameters<typeof logPolicyAudit>[0], 'ipAddress' | 'userAgent' | 'actorId'> & {
    actorId?: string | null;
  },
): Promise<void> {
  const meta = extractRequestMeta(req);
  await logPolicyAudit({
    ...input,
    actorId: input.actorId ?? req.user?.id ?? null,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export function computeAssignmentStatus(row: {
  status: PolicyAssignmentStatus;
  viewedAt: Date | null;
  downloadedAt: Date | null;
  acknowledgedAt: Date | null;
  dueAt: Date | null;
}, policyExpired: boolean): PolicyAssignmentStatus {
  if (policyExpired) return PolicyAssignmentStatus.EXPIRED;
  if (row.acknowledgedAt) return PolicyAssignmentStatus.ACKNOWLEDGED;
  if (row.dueAt && row.dueAt.getTime() < Date.now()) return PolicyAssignmentStatus.OVERDUE;
  if (row.downloadedAt) return PolicyAssignmentStatus.DOWNLOADED;
  if (row.viewedAt) return PolicyAssignmentStatus.VIEWED;
  return PolicyAssignmentStatus.NOT_VIEWED;
}

export async function refreshOverdueAssignments(policyId?: string): Promise<number> {
  const now = new Date();
  const where = {
    acknowledgedAt: null,
    dueAt: { lt: now },
    status: { notIn: [PolicyAssignmentStatus.ACKNOWLEDGED, PolicyAssignmentStatus.EXPIRED] as PolicyAssignmentStatus[] },
    ...(policyId ? { policyId } : {}),
  };
  const result = await prisma.companyPolicyAssignment.updateMany({
    where,
    data: { status: PolicyAssignmentStatus.OVERDUE },
  });
  return result.count;
}
