import {
  AssetRequestApprovalDecision,
  AssetRequestApprovalStep,
  AssetRequestStatus,
  AssetReturnOutcome,
  Prisma,
  UserRole,
} from '@prisma/client';
import prisma from '../../config/database';
import { assignAsset, returnAssetToStock, registerStockAsset, shapeAsset } from './asset.service';
import { createDraftRequisition } from './procurement.service';
import { emitErpNotification } from '../erpNotification.service';
import { sendBrowserPushToUsers } from '../browserPush.service';
import { generateCustodyAgreementPdf } from './assetRequestPdf.service';
import {
  getFinanceClearanceUserIds,
  isFinanceClearanceUser,
} from '../leaveAnnualWorkflow.service';

type Tx = Prisma.TransactionClient;

const requestInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeId: true,
      department: true,
      jobTitle: true,
      managerId: true,
    },
  },
  category: true,
  project: { select: { id: true, name: true, referenceNumber: true, projectNumber: true } },
  assignedProjectManager: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  approvals: {
    orderBy: { decidedAt: 'asc' as const },
    include: {
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  assignments: {
    include: {
      asset: { include: { category: true } },
    },
  },
  auditLogs: { orderBy: { createdAt: 'asc' as const }, take: 100 },
} as const;

export const OTHER_ASSET_CATEGORY_NAME = 'Other';

async function validateAssetRequestFields(input: {
  categoryId: string;
  assetType?: string | null;
  assetDescription?: string | null;
  businessJustification?: string;
}) {
  const category = await prisma.assetCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Error('INVALID_CATEGORY');

  const description = String(input.assetDescription || '').trim();
  if (!description) throw new Error('ASSET_DESCRIPTION_REQUIRED');

  const justification = String(input.businessJustification || '').trim();
  if (input.businessJustification !== undefined && !justification) {
    throw new Error('BUSINESS_JUSTIFICATION_REQUIRED');
  }

  if (category.name === OTHER_ASSET_CATEGORY_NAME) {
    const customType = String(input.assetType || '').trim();
    if (!customType) throw new Error('OTHER_ASSET_TYPE_REQUIRED');
  }

  return category;
}

async function nextRequestNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const row = await tx.assetRequestSequence.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `AR-${year}/${String(row.lastNumber).padStart(5, '0')}`;
}

async function appendAudit(
  tx: Tx,
  input: {
    requestId: string;
    actorId?: string | null;
    action: string;
    previousStatus?: AssetRequestStatus | null;
    newStatus?: AssetRequestStatus | null;
    comment?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.assetRequestAuditLog.create({
    data: {
      requestId: input.requestId,
      actorId: input.actorId || null,
      action: input.action,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      comment: input.comment || null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

async function notifyUsers(userIds: string[], title: string, message: string, url: string) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const payload = {
    id: `asset-req-${Date.now()}`,
    type: 'asset_request',
    title,
    message,
    createdAt: new Date().toISOString(),
  };
  for (const id of ids) emitErpNotification(id, payload);
  await sendBrowserPushToUsers(ids, { title, body: message, url, tag: 'asset-request' }).catch(
    () => {},
  );
}

async function resolveProjectManagerId(employeeId: string, projectId?: string | null): Promise<string | null> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { managerId: true, department: true },
  });
  if (employee?.managerId) return employee.managerId;

  if (projectId) {
    const assignment = await prisma.projectAssignment.findFirst({
      where: {
        projectId,
        employee: { role: { in: ['MANAGER', 'PROJECT_MANAGER'] }, isActive: true },
      },
      select: { employeeId: true },
    });
    if (assignment) return assignment.employeeId;
  }

  if (employee?.department) {
    const dept = await prisma.department.findFirst({
      where: { name: { equals: employee.department, mode: 'insensitive' }, status: 'ACTIVE' },
      select: { managerId: true },
    });
    if (dept?.managerId) return dept.managerId;
  }

  const fallback = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ['MANAGER', 'PROJECT_MANAGER', 'HR', 'ADMIN'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return fallback?.id ?? null;
}

async function usersWithRoles(roles: UserRole[]): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: { in: roles } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function isAssetRequestFinanceApprover(userId: string): Promise<boolean> {
  return isFinanceClearanceUser(userId);
}

export async function userCanApproveAssetRequestStep(
  userId: string,
  role: string,
  step: AssetRequestApprovalStep,
): Promise<boolean> {
  const allowed: Record<string, AssetRequestApprovalStep[]> = {
    MANAGER: ['PROJECT_MANAGER'],
    PROJECT_MANAGER: ['PROJECT_MANAGER'],
    HR: ['HR_VERIFICATION', 'HR_FINAL'],
    ADMIN: ['FINANCE', 'HR_VERIFICATION', 'HR_FINAL', 'ASSET_MANAGER'],
    SUPER_ADMIN: ['FINANCE', 'HR_VERIFICATION', 'HR_FINAL', 'ASSET_MANAGER'],
  };
  const roleSteps = allowed[role] || [];
  if (roleSteps.includes(step)) return true;
  if (step === 'FINANCE' && (await isFinanceClearanceUser(userId))) return true;
  return false;
}

export async function userCanViewAssetRequest(
  userId: string,
  role: string,
  row: {
    employeeId: string;
    assignedProjectManagerId: string | null;
    status: AssetRequestStatus;
  },
): Promise<boolean> {
  if (row.employeeId === userId) return true;
  if (row.assignedProjectManagerId === userId) return true;
  if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) return true;
  if (row.status === 'PENDING_FINANCE_APPROVAL' && (await isFinanceClearanceUser(userId))) {
    return true;
  }
  return false;
}

export async function listAssetRequests(filters: {
  employeeId?: string;
  status?: AssetRequestStatus | AssetRequestStatus[];
  pendingForUserId?: string;
  pendingRole?: string;
  isFinanceApprover?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 25));
  const where: Prisma.AssetRequestWhereInput = {};

  if (filters.employeeId) where.employeeId = filters.employeeId;

  if (filters.status) {
    where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
  }

  if (filters.pendingForUserId && filters.pendingRole) {
    const role = filters.pendingRole;
    const pendingOr: Prisma.AssetRequestWhereInput[] = [];

    if (role === 'MANAGER' || role === 'PROJECT_MANAGER') {
      pendingOr.push({
        status: 'PENDING_PM_APPROVAL',
        assignedProjectManagerId: filters.pendingForUserId,
      });
    }
    if (role === 'HR') {
      pendingOr.push({
        status: { in: ['PENDING_HR_VERIFICATION', 'PENDING_FINAL_HR_APPROVAL'] },
      });
    }
    if (filters.isFinanceApprover) {
      pendingOr.push({ status: 'PENDING_FINANCE_APPROVAL' });
    }
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      pendingOr.push({
        status: { in: ['PENDING_FINANCE_APPROVAL', 'PENDING_ASSET_ASSIGNMENT', 'PENDING_PROCUREMENT'] },
      });
    }

    if (pendingOr.length) {
      where.OR = pendingOr;
    }
  }

  const [rows, total] = await Promise.all([
    prisma.assetRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.assetRequest.count({ where }),
  ]);

  return { requests: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getAssetRequestById(id: string) {
  return prisma.assetRequest.findUnique({ where: { id }, include: requestInclude });
}

export async function createAssetRequestDraft(input: {
  employeeId: string;
  categoryId: string;
  businessJustification: string;
  quantity?: number;
  assetType?: string;
  assetDescription?: string;
  brandPreference?: string;
  modelPreference?: string;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiredByDate?: string | null;
  expectedUsageDuration?: string;
  additionalNotes?: string;
  projectId?: string | null;
  department?: string;
  subDepartment?: string;
  designation?: string;
  attachmentPath?: string;
}) {
  if (!input.categoryId?.trim()) throw new Error('CATEGORY_REQUIRED');
  await validateAssetRequestFields({
    categoryId: input.categoryId,
    assetType: input.assetType,
    assetDescription: input.assetDescription,
    businessJustification: input.businessJustification,
  });

  const employee = await prisma.user.findUnique({
    where: { id: input.employeeId },
    select: {
      department: true,
      jobTitle: true,
      position: true,
    },
  });
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  return prisma.$transaction(async (tx) => {
    const requestNumber = await nextRequestNumber(tx);
    const row = await tx.assetRequest.create({
      data: {
        requestNumber,
        employeeId: input.employeeId,
        department: input.department || employee.department || null,
        subDepartment: input.subDepartment || null,
        projectId: input.projectId || null,
        designation: input.designation || employee.jobTitle || employee.position || null,
        categoryId: input.categoryId,
        assetType: input.assetType?.trim() || null,
        assetDescription: input.assetDescription?.trim() || null,
        brandPreference: input.brandPreference || null,
        modelPreference: input.modelPreference || null,
        quantity: Math.max(1, input.quantity || 1),
        businessJustification: input.businessJustification.trim(),
        urgency: input.urgency || 'MEDIUM',
        requiredByDate: input.requiredByDate ? new Date(input.requiredByDate) : null,
        expectedUsageDuration: input.expectedUsageDuration || null,
        additionalNotes: input.additionalNotes || null,
        attachmentPath: input.attachmentPath || null,
        status: 'DRAFT',
      },
      include: requestInclude,
    });
    await appendAudit(tx, {
      requestId: row.id,
      actorId: input.employeeId,
      action: 'REQUEST_CREATED',
      newStatus: 'DRAFT',
    });
    return row;
  });
}

export async function updateAssetRequestDraft(
  requestId: string,
  employeeId: string,
  patch: Partial<{
    categoryId: string;
    businessJustification: string;
    quantity: number;
    assetType: string;
    assetDescription: string;
    brandPreference: string;
    modelPreference: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    requiredByDate: string | null;
    expectedUsageDuration: string;
    additionalNotes: string;
    projectId: string | null;
    attachmentPath: string;
  }>,
) {
  const existing = await prisma.assetRequest.findUnique({ where: { id: requestId } });
  if (!existing || existing.employeeId !== employeeId) throw new Error('NOT_FOUND');
  if (existing.status !== 'DRAFT') throw new Error('NOT_EDITABLE');

  const mergedCategoryId = patch.categoryId || existing.categoryId;
  await validateAssetRequestFields({
    categoryId: mergedCategoryId,
    assetType: patch.assetType !== undefined ? patch.assetType : existing.assetType,
    assetDescription: patch.assetDescription !== undefined ? patch.assetDescription : existing.assetDescription,
    businessJustification: patch.businessJustification ?? existing.businessJustification,
  });

  return prisma.assetRequest.update({
    where: { id: requestId },
    data: {
      ...(patch.categoryId && { categoryId: patch.categoryId }),
      ...(patch.businessJustification && { businessJustification: patch.businessJustification.trim() }),
      ...(patch.quantity != null && { quantity: Math.max(1, patch.quantity) }),
      ...(patch.assetType !== undefined && { assetType: patch.assetType?.trim() || null }),
      ...(patch.assetDescription !== undefined && { assetDescription: patch.assetDescription?.trim() || null }),
      ...(patch.brandPreference !== undefined && { brandPreference: patch.brandPreference || null }),
      ...(patch.modelPreference !== undefined && { modelPreference: patch.modelPreference || null }),
      ...(patch.urgency && { urgency: patch.urgency }),
      ...(patch.requiredByDate !== undefined && {
        requiredByDate: patch.requiredByDate ? new Date(patch.requiredByDate) : null,
      }),
      ...(patch.expectedUsageDuration !== undefined && {
        expectedUsageDuration: patch.expectedUsageDuration || null,
      }),
      ...(patch.additionalNotes !== undefined && { additionalNotes: patch.additionalNotes || null }),
      ...(patch.projectId !== undefined && { projectId: patch.projectId }),
      ...(patch.attachmentPath !== undefined && { attachmentPath: patch.attachmentPath || null }),
    },
    include: requestInclude,
  });
}

export async function submitAssetRequest(requestId: string, employeeId: string) {
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.assetRequest.findUnique({ where: { id: requestId } });
    if (!existing || existing.employeeId !== employeeId) throw new Error('NOT_FOUND');
    if (existing.status !== 'DRAFT') throw new Error('INVALID_STATUS');

    const assignedPm = await resolveProjectManagerId(employeeId, existing.projectId);

    const updated = await tx.assetRequest.update({
      where: { id: requestId },
      data: {
        status: 'PENDING_PM_APPROVAL',
        submittedAt: new Date(),
        assignedProjectManagerId: assignedPm,
      },
      include: requestInclude,
    });

    await appendAudit(tx, {
      requestId,
      actorId: employeeId,
      action: 'REQUEST_SUBMITTED',
      previousStatus: 'DRAFT',
      newStatus: 'PENDING_PM_APPROVAL',
    });

    return updated;
  });

  if (row.assignedProjectManagerId) {
    await notifyUsers(
      [row.assignedProjectManagerId],
      'Asset request pending approval',
      `${row.requestNumber} requires your review.`,
      '/eam?tab=requests',
    );
  }

  return row;
}

async function recordApproval(
  tx: Tx,
  input: {
    requestId: string;
    step: AssetRequestApprovalStep;
    decision: AssetRequestApprovalDecision;
    approverId: string;
    comments?: string;
    approvalNotes?: string;
  },
) {
  await tx.assetRequestApproval.create({
    data: {
      requestId: input.requestId,
      step: input.step,
      decision: input.decision,
      approverId: input.approverId,
      comments: input.comments || null,
      approvalNotes: input.approvalNotes || null,
    },
  });
}

export async function processApproval(input: {
  requestId: string;
  approverId: string;
  approverRole: string;
  step: AssetRequestApprovalStep;
  decision: AssetRequestApprovalDecision;
  comments?: string;
  approvalNotes?: string;
}) {
  const existing = await prisma.assetRequest.findUnique({ where: { id: input.requestId } });
  if (!existing) throw new Error('NOT_FOUND');

  const statusForStep: Record<AssetRequestApprovalStep, AssetRequestStatus> = {
    PROJECT_MANAGER: 'PENDING_PM_APPROVAL',
    HR_VERIFICATION: 'PENDING_HR_VERIFICATION',
    FINANCE: 'PENDING_FINANCE_APPROVAL',
    HR_FINAL: 'PENDING_FINAL_HR_APPROVAL',
    ASSET_MANAGER: 'PENDING_ASSET_ASSIGNMENT',
    ASSET_DIRECTOR: 'PENDING_ASSET_ASSIGNMENT',
  };

  if (existing.status !== statusForStep[input.step]) {
    throw new Error('INVALID_STATUS_FOR_STEP');
  }

  let nextStatus: AssetRequestStatus = existing.status;
  const notifyIds: string[] = [];

  if (input.decision === 'REJECTED') {
    nextStatus = 'REJECTED';
    notifyIds.push(existing.employeeId);
  } else if (input.decision === 'CLARIFICATION' || input.decision === 'RETURNED') {
    nextStatus = 'DRAFT';
    notifyIds.push(existing.employeeId);
  } else if (input.decision === 'APPROVED') {
    const nextMap: Partial<Record<AssetRequestApprovalStep, AssetRequestStatus>> = {
      PROJECT_MANAGER: 'PENDING_HR_VERIFICATION',
      HR_VERIFICATION: 'PENDING_FINANCE_APPROVAL',
      FINANCE: 'PENDING_FINAL_HR_APPROVAL',
      HR_FINAL: 'PENDING_ASSET_ASSIGNMENT',
    };
    nextStatus = nextMap[input.step] || existing.status;
    if (input.step === 'PROJECT_MANAGER') {
      notifyIds.push(...(await usersWithRoles(['HR'])));
    } else if (input.step === 'HR_VERIFICATION') {
      notifyIds.push(...(await getFinanceClearanceUserIds()));
    } else if (input.step === 'FINANCE') {
      notifyIds.push(...(await usersWithRoles(['HR'])));
    } else if (input.step === 'HR_FINAL') {
      notifyIds.push(...(await usersWithRoles(['ADMIN', 'SUPER_ADMIN', 'HR'])));
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    await recordApproval(tx, input);

    const updated = await tx.assetRequest.update({
      where: { id: input.requestId },
      data: {
        status: nextStatus,
        ...(nextStatus === 'REJECTED' ? { closedAt: new Date() } : {}),
      },
      include: requestInclude,
    });

    await appendAudit(tx, {
      requestId: input.requestId,
      actorId: input.approverId,
      action: `${input.step}_${input.decision}`,
      previousStatus: existing.status,
      newStatus: nextStatus,
      comment: input.comments,
    });

    return updated;
  });

  if (nextStatus === 'PENDING_ASSET_ASSIGNMENT') {
    return routeAfterFinalHrApproval(row.id, input.approverId);
  }

  if (notifyIds.length) {
    const financePending = nextStatus === 'PENDING_FINANCE_APPROVAL';
    await notifyUsers(
      notifyIds,
      financePending ? 'Finance approval required' : 'Asset request update',
      financePending
        ? `${row.requestNumber} is awaiting finance approval.`
        : `${row.requestNumber} status is now ${nextStatus.replace(/_/g, ' ')}.`,
      '/eam?tab=requests',
    );
  }

  return row;
}

export async function listAvailableAssetsForRequest(requestId: string) {
  const request = await prisma.assetRequest.findUnique({
    where: { id: requestId },
    include: { category: true },
  });
  if (!request) throw new Error('NOT_FOUND');

  const rows = await prisma.asset.findMany({
    where: { categoryId: request.categoryId, status: 'AVAILABLE' },
    include: {
      category: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, employeeId: true } },
    },
    orderBy: { assetTag: 'asc' },
  });

  return {
    categoryName: request.category?.name || 'Asset',
    assets: rows.map((r) => shapeAsset(r)),
  };
}

export async function registerStockForRequest(input: {
  requestId: string;
  performedById: string;
  serialNumber?: string;
  purchaseCost?: number;
}) {
  const request = await prisma.assetRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new Error('NOT_FOUND');
  if (!['PENDING_ASSET_ASSIGNMENT', 'PENDING_PROCUREMENT'].includes(request.status)) {
    throw new Error('INVALID_STATUS');
  }

  return registerStockAsset({
    categoryId: request.categoryId,
    performedById: input.performedById,
    serialNumber: input.serialNumber,
    purchaseCost: input.purchaseCost,
    notes: `Registered for asset request ${request.requestNumber}`,
  });
}

export async function routeAfterFinalHrApproval(requestId: string, actorId: string) {
  const existing = await prisma.assetRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new Error('NOT_FOUND');

  const availableCount = await prisma.asset.count({
    where: { categoryId: existing.categoryId, status: 'AVAILABLE' },
  });

  if (availableCount >= existing.quantity) {
    return prisma.assetRequest.findUnique({ where: { id: requestId }, include: requestInclude });
  }

  const requisition = await createDraftRequisition({
    categoryId: existing.categoryId,
    suggestedQuantity: existing.quantity,
    reason: `Auto-created from asset request ${existing.requestNumber}`,
    createdById: actorId,
  });

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.assetRequest.update({
      where: { id: requestId },
      data: {
        status: 'PENDING_PROCUREMENT',
        purchaseRequisitionId: requisition.id,
      },
      include: requestInclude,
    });
    await appendAudit(tx, {
      requestId,
      actorId,
      action: 'PROCUREMENT_REQUEST_CREATED',
      previousStatus: 'PENDING_ASSET_ASSIGNMENT',
      newStatus: 'PENDING_PROCUREMENT',
      metadata: { purchaseRequisitionId: requisition.id },
    });
    return updated;
  });

  await notifyUsers(
    await usersWithRoles(['ADMIN', 'SUPER_ADMIN', 'HR']),
    'Procurement required',
    `${existing.requestNumber} — no stock available`,
    '/eam/procurement',
  );

  return row;
}

export async function assignAssetToRequest(input: {
  requestId: string;
  assetId?: string;
  performedById: string;
  registerStock?: boolean;
  serialNumber?: string;
  purchaseCost?: number;
  conditionNotes?: string;
  warrantyInfo?: string;
  locationType?: 'OFFICE_ROOM' | 'REMOTE';
  locationId?: string;
}) {
  const request = await prisma.assetRequest.findUnique({
    where: { id: input.requestId },
    include: { employee: true, category: true },
  });
  if (!request) throw new Error('NOT_FOUND');
  if (!['PENDING_ASSET_ASSIGNMENT', 'PENDING_PROCUREMENT'].includes(request.status)) {
    throw new Error('INVALID_STATUS');
  }

  let assetId = String(input.assetId || '').trim();
  if (!assetId) {
    if (!input.registerStock) throw new Error('ASSET_ID_REQUIRED');
    const created = await registerStockForRequest({
      requestId: input.requestId,
      performedById: input.performedById,
      serialNumber: input.serialNumber,
      purchaseCost: input.purchaseCost,
    });
    assetId = created.id;
  }

  const assigned = await assignAsset({
    assetId,
    assigneeId: request.employeeId,
    performedById: input.performedById,
    locationType: input.locationType,
    locationId: input.locationId,
    notes: `Issued via ${request.requestNumber}`,
  });

  const custodyPath = await generateCustodyAgreementPdf({
    requestId: request.id,
    assetId,
    assignedById: input.performedById,
  });

  const row = await prisma.$transaction(async (tx) => {
    await tx.assetRequestAssignment.create({
      data: {
        requestId: request.id,
        assetId,
        employeeId: request.employeeId,
        conditionNotes: input.conditionNotes || null,
        warrantyInfo: input.warrantyInfo || null,
        locationType: input.locationType || 'OFFICE_ROOM',
        locationId: input.locationId || null,
        department: request.department,
        projectId: request.projectId,
        assignedById: input.performedById,
        custodyDocPath: custodyPath,
      },
    });

    const updated = await tx.assetRequest.update({
      where: { id: request.id },
      data: {
        status: 'ASSET_ISSUED',
        custodyDocumentPath: custodyPath,
      },
      include: requestInclude,
    });

    await appendAudit(tx, {
      requestId: request.id,
      actorId: input.performedById,
      action: 'ASSET_ASSIGNED',
      previousStatus: request.status,
      newStatus: 'ASSET_ISSUED',
      metadata: { assetId, assetTag: assigned.assetTag },
    });

    return updated;
  });

  await notifyUsers(
    [request.employeeId],
    'Asset issued',
    `${assigned.assetTag} assigned for ${request.requestNumber}`,
    '/eam?tab=requests',
  );

  return row;
}

export async function recordAssetReturn(input: {
  assetId: string;
  custodianId: string;
  processedById: string;
  outcome: AssetReturnOutcome;
  conditionNotes?: string;
  accessoriesReturned?: string;
  damageDetails?: string;
  missingComponents?: string;
  remarks?: string;
  requestId?: string;
}) {
  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw new Error('ASSET_NOT_FOUND');

  const row = await prisma.$transaction(async (tx) => {
    const ret = await tx.assetReturn.create({
      data: {
        assetId: input.assetId,
        custodianId: input.custodianId,
        processedById: input.processedById,
        requestId: input.requestId || null,
        outcome: input.outcome,
        conditionNotes: input.conditionNotes || null,
        accessoriesReturned: input.accessoriesReturned || null,
        damageDetails: input.damageDetails || null,
        missingComponents: input.missingComponents || null,
        remarks: input.remarks || null,
      },
    });

    if (input.outcome === 'RETURNED_GOOD') {
      await returnAssetToStock({
        assetId: input.assetId,
        performedById: input.processedById,
        notes: input.remarks,
      });
    } else if (input.outcome === 'RETURNED_DAMAGED' || input.outcome === 'REPAIR_REQUIRED') {
      await tx.assetDamageCase.create({
        data: {
          returnId: ret.id,
          requestId: input.requestId || null,
          assetId: input.assetId,
          description: input.damageDetails || input.conditionNotes || 'Asset returned damaged',
          status: 'OPEN',
        },
      });
    } else if (input.outcome === 'LOST' || input.outcome === 'STOLEN') {
      await tx.assetLossCase.create({
        data: {
          returnId: ret.id,
          requestId: input.requestId || null,
          assetId: input.assetId,
          employeeExplanation: input.remarks || null,
          status: 'OPEN',
        },
      });
    }

    return ret;
  });

  await notifyUsers(
    await usersWithRoles(['HR', 'ADMIN', 'SUPER_ADMIN']),
    'Asset return recorded',
    `Asset ${asset.assetTag} — ${input.outcome}`,
    '/eam?tab=requests',
  );

  return row;
}

export async function buildEmployeeClearanceChecklist(userId: string, resignationId?: string) {
  const assets = await prisma.asset.findMany({
    where: { assignedToId: userId, status: 'ASSIGNED' },
    include: { category: true },
  });

  const records = [];
  for (const a of assets) {
    const existing = await prisma.assetClearanceRecord.findFirst({
      where: {
        userId,
        assetId: a.id,
        resignationId: resignationId ?? null,
      },
    });
    if (existing) {
      records.push(existing);
      continue;
    }
    const rec = await prisma.assetClearanceRecord.create({
      data: {
        userId,
        resignationId: resignationId || null,
        assetId: a.id,
        assetLabel: `${a.assetTag} — ${a.category.name}`,
        status: 'PENDING',
      },
    });
    records.push(rec);
  }

  return { assets, clearanceRecords: records };
}

export async function getPendingClearanceCount(userId: string): Promise<number> {
  const assigned = await prisma.asset.count({
    where: { assignedToId: userId, status: 'ASSIGNED' },
  });
  const pendingRecords = await prisma.assetClearanceRecord.count({
    where: { userId, status: 'PENDING' },
  });
  return Math.max(assigned, pendingRecords);
}

export async function listEmployeeClearance(userId: string) {
  await buildEmployeeClearanceChecklist(userId);
  return prisma.assetClearanceRecord.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { asset: { include: { category: true } } },
  });
}
