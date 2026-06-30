import crypto from 'crypto';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { logProjectActivity } from './projectActivity.service';
import { emitErpNotification, notifyActiveAdmins } from './erpNotification.service';

const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 3;

export const DELETION_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  OTP_GENERATED: 'OTP_GENERATED',
  OTP_VERIFIED: 'OTP_VERIFIED',
  DELETED: 'DELETED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  LOCKED: 'LOCKED',
} as const;

const ACTIVE_REQUESTER_STATUSES = [
  DELETION_STATUS.PENDING_APPROVAL,
  DELETION_STATUS.OTP_GENERATED,
  DELETION_STATUS.OTP_VERIFIED,
];

export function requiresProjectDeletionOtp(role: string | undefined): boolean {
  const r = String(role || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return r === 'PROJECT_MANAGER' || r === 'MANAGER';
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

function isAdminRole(role: string | undefined): boolean {
  const r = String(role || '').trim().toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

async function userDisplayName(userId: string, fallbackEmail?: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  const name = `${(u?.firstName || '').trim()} ${(u?.lastName || '').trim()}`.trim();
  return name || u?.email || fallbackEmail || 'User';
}

export async function managerCanAccessProjectForDeletion(
  project: {
    id: string;
    createdBy: string | null;
    assignedEmployees?: { employeeId: string }[];
    contracts?: { assignedManagerId: string | null; assignedManagerEmail: string | null }[];
  },
  req: AuthRequest,
): Promise<boolean> {
  const role = req.user?.role;
  if (role === 'ADMIN' || role === 'HR' || role === 'SUPER_ADMIN') return true;
  if (!requiresProjectDeletionOtp(role)) return false;

  const isCreator = project.createdBy === req.user?.id;
  const isAssigned = project.assignedEmployees?.some((a) => a.employeeId === req.user?.id);
  const hasAssignedContract = project.contracts?.some(
    (c) =>
      (req.user?.email && c.assignedManagerEmail === req.user.email) ||
      (req.user?.id && c.assignedManagerId === req.user.id),
  );
  return Boolean(isCreator || isAssigned || hasAssignedContract);
}

/** PM/Manager: create deletion request (no OTP until admin approves). */
export async function requestProjectDeletion(
  projectId: string,
  req: AuthRequest,
): Promise<{ success: boolean; message: string; requestId?: string }> {
  if (!req.user?.id) return { success: false, message: 'Authentication required' };
  if (!requiresProjectDeletionOtp(req.user.role)) {
    return { success: false, message: 'Administrators can delete projects directly without approval.' };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignedEmployees: { select: { employeeId: true } },
      contracts: { select: { assignedManagerId: true, assignedManagerEmail: true } },
    },
  });
  if (!project) return { success: false, message: 'Project not found' };
  if (!(await managerCanAccessProjectForDeletion(project, req))) {
    return {
      success: false,
      message: 'You can only request deletion for projects you manage or created from your contracts.',
    };
  }

  const existing = await prisma.projectDeletionOtpRequest.findFirst({
    where: {
      projectId,
      requestedById: req.user.id,
      status: { in: ACTIVE_REQUESTER_STATUSES },
    },
  });
  if (existing) {
    return {
      success: true,
      message: 'A deletion request is already pending. Wait for Admin approval or check notifications.',
      requestId: existing.id,
    };
  }

  await prisma.projectDeletionOtpRequest.updateMany({
    where: {
      projectId,
      requestedById: req.user.id,
      status: { in: [DELETION_STATUS.PENDING_APPROVAL, DELETION_STATUS.OTP_GENERATED] },
    },
    data: { status: DELETION_STATUS.EXPIRED },
  });

  const requesterName = await userDisplayName(req.user.id, req.user.email);
  const label = project.referenceNumber || project.name;

  const record = await prisma.projectDeletionOtpRequest.create({
    data: {
      projectId,
      projectName: project.name,
      projectRef: project.referenceNumber,
      requestedById: req.user.id,
      status: DELETION_STATUS.PENDING_APPROVAL,
    },
  });

  await logProjectActivity({
    projectId,
    actorId: req.user.id,
    action: 'PROJECT_DELETE_REQUESTED',
    summary: `${requesterName} requested deletion approval for project`,
    metadata: {
      projectName: project.name,
      referenceNumber: project.referenceNumber,
      requestId: record.id,
      status: DELETION_STATUS.PENDING_APPROVAL,
    },
  });

  const adminMessage = `${requesterName} requested deletion of project ${label}.`;
  await notifyActiveAdmins({
    id: `pdr-admin-${record.id}`,
    type: 'project_deletion_request',
    title: 'Project deletion approval',
    message: adminMessage,
    projectId,
    requestId: record.id,
    status: DELETION_STATUS.PENDING_APPROVAL,
    requesterName,
    createdAt: new Date().toISOString(),
  });

  emitErpNotification(req.user.id, {
    id: `pdr-req-${record.id}`,
    type: 'project_deletion_pending',
    title: 'Deletion request submitted',
    message: `Waiting for Admin/Super Admin approval to delete ${label}.`,
    projectId,
    requestId: record.id,
    status: DELETION_STATUS.PENDING_APPROVAL,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    message: 'Deletion request sent to Admin/Super Admin. You will receive an OTP in ERP notifications when approved.',
    requestId: record.id,
  };
}

async function generateOtpForRequest(
  requestId: string,
  adminId: string,
): Promise<{ success: boolean; message: string; otp?: string; expiresAt?: string }> {
  const record = await prisma.projectDeletionOtpRequest.findUnique({
    where: { id: requestId },
    include: { requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });
  if (!record) return { success: false, message: 'Deletion request not found' };
  if (record.status === DELETION_STATUS.REJECTED) {
    return { success: false, message: 'This request was rejected.' };
  }
  if (record.status === DELETION_STATUS.DELETED) {
    return { success: false, message: 'This project was already deleted.' };
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const adminName = await userDisplayName(adminId);

  await prisma.projectDeletionOtpRequest.update({
    where: { id: requestId },
    data: {
      otpHash: hashOtp(otp),
      expiresAt,
      failedAttempts: 0,
      status: DELETION_STATUS.OTP_GENERATED,
      approvedById: adminId,
      approvedAt: new Date(),
      rejectedById: null,
      rejectedAt: null,
    },
  });

  const label = record.projectRef || record.projectName;
  const requesterName =
    `${(record.requestedBy?.firstName || '').trim()} ${(record.requestedBy?.lastName || '').trim()}`.trim() ||
    record.requestedBy?.email ||
    'Requester';

  await logProjectActivity({
    projectId: record.projectId,
    actorId: adminId,
    action: 'PROJECT_DELETE_OTP_GENERATED',
    summary: `${adminName} approved deletion and generated OTP for ${label}`,
    metadata: {
      requestId,
      approvedBy: adminName,
      requestedBy: requesterName,
      expiresAt: expiresAt.toISOString(),
      status: DELETION_STATUS.OTP_GENERATED,
    },
  });

  emitErpNotification(record.requestedById, {
    id: `pdr-otp-${requestId}-${Date.now()}`,
    type: 'project_deletion_otp',
    title: 'Deletion OTP ready',
    message: `Enter this OTP within 5 minutes to delete ${label}: ${otp}`,
    projectId: record.projectId,
    requestId,
    deletionOtp: otp,
    expiresAt: expiresAt.toISOString(),
    status: DELETION_STATUS.OTP_GENERATED,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    message: 'OTP generated and sent to the requester via ERP notifications.',
    otp,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function approveProjectDeletionRequest(
  requestId: string,
  req: AuthRequest,
): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
  if (!req.user?.id || !isAdminRole(req.user.role)) {
    return { success: false, message: 'Only Admin or Super Admin can approve deletion requests.' };
  }
  const record = await prisma.projectDeletionOtpRequest.findUnique({ where: { id: requestId } });
  if (!record) return { success: false, message: 'Deletion request not found' };
  if (record.status === DELETION_STATUS.REJECTED) {
    return { success: false, message: 'Request was already rejected.' };
  }
  const result = await generateOtpForRequest(requestId, req.user.id);
  if (!result.success) return result;
  return {
    success: true,
    message: result.message,
    data: { expiresAt: result.expiresAt, status: DELETION_STATUS.OTP_GENERATED },
  };
}

export async function regenerateProjectDeletionOtp(
  requestId: string,
  req: AuthRequest,
): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
  if (!req.user?.id || !isAdminRole(req.user.role)) {
    return { success: false, message: 'Only Admin or Super Admin can regenerate OTP.' };
  }
  const record = await prisma.projectDeletionOtpRequest.findUnique({ where: { id: requestId } });
  if (!record) return { success: false, message: 'Deletion request not found' };
  if (![DELETION_STATUS.OTP_GENERATED, DELETION_STATUS.EXPIRED, DELETION_STATUS.LOCKED].includes(record.status as any)) {
    return { success: false, message: 'OTP can only be regenerated after approval or when expired/locked.' };
  }
  const result = await generateOtpForRequest(requestId, req.user.id);
  if (!result.success) return result;
  return {
    success: true,
    message: result.message,
    data: { expiresAt: result.expiresAt, status: DELETION_STATUS.OTP_GENERATED },
  };
}

export async function rejectProjectDeletionRequest(
  requestId: string,
  req: AuthRequest,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  if (!req.user?.id || !isAdminRole(req.user.role)) {
    return { success: false, message: 'Only Admin or Super Admin can reject deletion requests.' };
  }
  const record = await prisma.projectDeletionOtpRequest.findUnique({
    where: { id: requestId },
    include: { requestedBy: { select: { id: true, email: true } } },
  });
  if (!record) return { success: false, message: 'Deletion request not found' };
  if (record.status === DELETION_STATUS.DELETED) {
    return { success: false, message: 'Project already deleted.' };
  }

  const adminName = await userDisplayName(req.user.id, req.user.email);
  const label = record.projectRef || record.projectName;

  await prisma.projectDeletionOtpRequest.update({
    where: { id: requestId },
    data: {
      status: DELETION_STATUS.REJECTED,
      rejectedById: req.user.id,
      rejectedAt: new Date(),
      otpHash: null,
      expiresAt: null,
    },
  });

  await logProjectActivity({
    projectId: record.projectId,
    actorId: req.user.id,
    action: 'PROJECT_DELETE_REJECTED',
    summary: `${adminName} rejected deletion request for ${label}`,
    metadata: { requestId, reason: reason || null, status: DELETION_STATUS.REJECTED },
  });

  emitErpNotification(record.requestedById, {
    id: `pdr-rej-${requestId}`,
    type: 'project_deletion_rejected',
    title: 'Deletion request rejected',
    message: reason
      ? `Admin rejected deletion of ${label}: ${reason}`
      : `Admin rejected deletion of ${label}.`,
    projectId: record.projectId,
    requestId,
    status: DELETION_STATUS.REJECTED,
    createdAt: new Date().toISOString(),
  });

  return { success: true, message: 'Deletion request rejected.' };
}

export async function listProjectDeletionRequestsForAdmin(
  statusFilter?: string,
): Promise<unknown[]> {
  const where: { status?: string | { in: string[] } } = {};
  if (statusFilter && statusFilter !== 'all') {
    where.status = statusFilter;
  } else {
    where.status = {
      in: [
        DELETION_STATUS.PENDING_APPROVAL,
        DELETION_STATUS.OTP_GENERATED,
        DELETION_STATUS.OTP_VERIFIED,
        DELETION_STATUS.EXPIRED,
        DELETION_STATUS.LOCKED,
      ],
    };
  }

  const rows = await prisma.projectDeletionOtpRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      rejectedBy: { select: { id: true, lastName: true, firstName: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectName: r.projectName,
    projectRef: r.projectRef,
    status: r.status,
    failedAttempts: r.failedAttempts,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    otpVerifiedAt: r.otpVerifiedAt,
    deletedAt: r.deletedAt,
    requester: r.requestedBy
      ? {
          id: r.requestedBy.id,
          name: `${r.requestedBy.firstName || ''} ${r.requestedBy.lastName || ''}`.trim() || r.requestedBy.email,
          email: r.requestedBy.email,
        }
      : null,
    approvedBy: r.approvedBy
      ? {
          id: r.approvedBy.id,
          name: `${r.approvedBy.firstName || ''} ${r.approvedBy.lastName || ''}`.trim() || r.approvedBy.email,
        }
      : null,
    rejectedBy: r.rejectedBy
      ? {
          id: r.rejectedBy.id,
          name: `${r.rejectedBy.firstName || ''} ${r.rejectedBy.lastName || ''}`.trim() || r.rejectedBy.email,
        }
      : null,
  }));
}

export async function getMyActiveDeletionRequest(userId: string): Promise<unknown | null> {
  const record = await prisma.projectDeletionOtpRequest.findFirst({
    where: {
      requestedById: userId,
      status: { in: [DELETION_STATUS.OTP_GENERATED, DELETION_STATUS.PENDING_APPROVAL] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return null;
  if (
    record.status === DELETION_STATUS.OTP_GENERATED &&
    record.expiresAt &&
    record.expiresAt < new Date()
  ) {
    await prisma.projectDeletionOtpRequest.update({
      where: { id: record.id },
      data: { status: DELETION_STATUS.EXPIRED },
    });
    return { ...record, status: DELETION_STATUS.EXPIRED };
  }
  return {
    id: record.id,
    projectId: record.projectId,
    projectName: record.projectName,
    projectRef: record.projectRef,
    status: record.status,
    expiresAt: record.expiresAt,
    failedAttempts: record.failedAttempts,
    createdAt: record.createdAt,
  };
}

export async function validateAndConsumeDeletionOtp(
  projectId: string,
  otp: string,
  userId: string,
): Promise<
  | { ok: true; requestId: string }
  | { ok: false; message: string; status: number }
> {
  const record = await prisma.projectDeletionOtpRequest.findFirst({
    where: {
      projectId,
      requestedById: userId,
      status: DELETION_STATUS.OTP_GENERATED,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record || !record.otpHash || !record.expiresAt) {
    return {
      ok: false,
      status: 403,
      message: 'No approved deletion OTP. Wait for Admin approval in ERP notifications.',
    };
  }
  if (record.expiresAt < new Date()) {
    await prisma.projectDeletionOtpRequest.update({
      where: { id: record.id },
      data: { status: DELETION_STATUS.EXPIRED },
    });
    return {
      ok: false,
      status: 403,
      message: 'OTP expired. Ask Admin to generate a new OTP (valid 5 minutes).',
    };
  }
  if (record.failedAttempts >= MAX_OTP_ATTEMPTS) {
    await prisma.projectDeletionOtpRequest.update({
      where: { id: record.id },
      data: { status: DELETION_STATUS.LOCKED },
    });
    return {
      ok: false,
      status: 403,
      message: 'Maximum 3 incorrect attempts. Ask Admin to generate a new OTP.',
    };
  }
  if (hashOtp(otp) !== record.otpHash) {
    const attempts = record.failedAttempts + 1;
    await prisma.projectDeletionOtpRequest.update({
      where: { id: record.id },
      data: {
        failedAttempts: attempts,
        status: attempts >= MAX_OTP_ATTEMPTS ? DELETION_STATUS.LOCKED : DELETION_STATUS.OTP_GENERATED,
      },
    });
    const remaining = MAX_OTP_ATTEMPTS - attempts;
    return {
      ok: false,
      status: 403,
      message:
        remaining > 0
          ? `Invalid OTP. ${remaining} attempt(s) remaining.`
          : 'Maximum 3 incorrect attempts. Ask Admin to generate a new OTP.',
    };
  }

  await prisma.projectDeletionOtpRequest.update({
    where: { id: record.id },
    data: { status: DELETION_STATUS.OTP_VERIFIED, otpVerifiedAt: new Date(), usedAt: new Date() },
  });
  return { ok: true, requestId: record.id };
}

export async function markDeletionRequestDeleted(requestId: string): Promise<void> {
  await prisma.projectDeletionOtpRequest.update({
    where: { id: requestId },
    data: { status: DELETION_STATUS.DELETED, deletedAt: new Date() },
  });
}

/** @deprecated alias */
export const requestProjectDeletionOtp = requestProjectDeletion;

export async function verifyProjectDeletionOtp(
  projectId: string,
  otp: string,
  req: AuthRequest,
): Promise<{ valid: boolean; message: string }> {
  if (!req.user?.id) return { valid: false, message: 'Authentication required' };
  const r = await validateAndConsumeDeletionOtp(projectId, otp, req.user.id);
  if (!r.ok) return { valid: false, message: r.message };
  return { valid: true, message: 'OTP verified. You may delete the project now.' };
}

export async function executeProjectDeletionInTransaction(projectId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tenders = await tx.tender.findMany({
      where: { projectId },
      select: { id: true },
    });
    const tenderIds = tenders.map((t) => t.id);

    if (tenderIds.length > 0) {
      await tx.tenderInvitation.deleteMany({ where: { tenderId: { in: tenderIds } } });
      await tx.technicalSubmission.deleteMany({ where: { tenderId: { in: tenderIds } } });
    }

    await tx.projectAssignment.deleteMany({ where: { projectId } });
    await tx.task.deleteMany({ where: { projectId } });
    await tx.document.deleteMany({ where: { projectId } });
    await tx.tender.deleteMany({ where: { projectId } });
    await tx.projectChecklist.deleteMany({ where: { projectId } });
    await tx.projectAttachment.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
}
