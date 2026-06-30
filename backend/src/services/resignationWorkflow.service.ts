import prisma from '../config/database';
import {
  ResignationWorkflowStage,
  ResignationStatus,
  RetentionRecommendation,
  Prisma,
} from '@prisma/client';
import { sendBrowserPushToUsers } from './browserPush.service';
import { getFinanceClearanceUserIds } from './leaveAnnualWorkflow.service';

export const RETENTION_TYPES_REQUIRING_GM: RetentionRecommendation[] = [
  'RETAIN_EMPLOYEE',
  'SALARY_INCREMENT',
  'PROMOTION',
  'DEPARTMENT_TRANSFER',
  'ADDITIONAL_BENEFITS',
  'CRITICAL_RESOURCE_MGMT_REVIEW',
];

const STAGE_LABELS: Record<ResignationWorkflowStage, string> = {
  PENDING_PROJECT_MANAGER: 'Pending Project Manager Approval',
  DISCUSSION_REQUESTED: 'Discussion Requested',
  PENDING_GM_RETENTION_REVIEW: 'Pending GM / Director Retention Review',
  PENDING_EMPLOYEE_RETENTION_RESPONSE: 'Pending Employee Retention Response',
  REJECTED_BY_PROJECT_MANAGER: 'Rejected by Project Manager',
  PENDING_HR_REVIEW: 'Pending HR Review',
  REJECTED_BY_HR: 'Rejected by HR',
  PENDING_FINANCE_CLEARANCE: 'Pending Finance Clearance',
  FINANCE_CLEARANCE_REJECTED: 'Finance Clearance Rejected',
  FINANCE_CLEARANCE_ON_HOLD: 'Finance Clearance On Hold',
  PENDING_HR_FINAL_CLEARANCE: 'Pending HR Final Clearance',
  HR_FINAL_ON_HOLD: 'HR Final Clearance On Hold',
  REJECTED_HR_FINAL: 'Rejected at HR Final Clearance',
  RESIGNATION_COMPLETED: 'Resignation Completed',
  WITHDRAWN: 'Withdrawn',
};

export function workflowStageLabel(stage: ResignationWorkflowStage | null | undefined): string {
  if (!stage) return '—';
  return STAGE_LABELS[stage] || stage;
}

export function retentionRequiresGm(recommendation: RetentionRecommendation | null | undefined): boolean {
  if (!recommendation) return false;
  return RETENTION_TYPES_REQUIRING_GM.includes(recommendation);
}

export async function getHrUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function getGeneralManagerUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        { jobTitle: { contains: 'General Manager', mode: 'insensitive' } },
        { jobTitle: { contains: 'Director', mode: 'insensitive' } },
        { position: { contains: 'General Manager', mode: 'insensitive' } },
        { position: { contains: 'Director', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return [...new Set(users.map((u) => u.id))];
}

export async function resolveProjectManagerId(employeeUserId: string): Promise<string | null> {
  const emp = await prisma.user.findUnique({
    where: { id: employeeUserId },
    select: { managerId: true, department: true },
  });
  if (!emp) return null;

  if (emp.managerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: emp.managerId },
      select: { id: true, role: true, isActive: true },
    });
    if (mgr?.isActive) return mgr.id;
  }

  const pm = await prisma.user.findFirst({
    where: {
      isActive: true,
      role: { in: ['PROJECT_MANAGER', 'MANAGER'] },
      ...(emp.department ? { department: emp.department } : {}),
    },
    select: { id: true },
  });
  return pm?.id ?? emp.managerId ?? null;
}

export async function appendResignationLog(params: {
  resignationId: string;
  actorId?: string | null;
  action: string;
  previousStage?: ResignationWorkflowStage | null;
  newStage?: ResignationWorkflowStage | null;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.resignationWorkflowLog.create({
    data: {
      resignationId: params.resignationId,
      actorId: params.actorId || null,
      action: params.action,
      previousStage: params.previousStage ?? null,
      newStage: params.newStage ?? null,
      comment: params.comment?.trim() || null,
      metadata: params.metadata != null ? (params.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

async function notifyUsers(userIds: string[], title: string, body: string, url: string): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  try {
    await sendBrowserPushToUsers(unique, { title, body, url, tag: 'resignation-workflow' });
  } catch {
    /* optional */
  }
}

export async function notifyResignationWorkflow(params: {
  resignationId: string;
  event: string;
  employeeUserId: string;
  projectManagerId?: string | null;
}): Promise<void> {
  const { resignationId, event, employeeUserId, projectManagerId } = params;
  const url = `/employee/resignation?resignationId=${resignationId}`;
  const hrUrl = `/workplace/resignations?resignationId=${resignationId}`;
  const teamUrl = `/workplace/resignations/team?resignationId=${resignationId}`;
  const financeUrl = `/workplace/resignations/finance?resignationId=${resignationId}`;
  const hrIds = await getHrUserIds();
  const financeIds = await getFinanceClearanceUserIds();
  const gmIds = await getGeneralManagerUserIds();

  switch (event) {
    case 'submitted':
      await notifyUsers([employeeUserId], 'Resignation Submitted', 'Your resignation request has been submitted.', url);
      if (projectManagerId) {
        await notifyUsers([projectManagerId], 'Resignation Review Required', 'An employee submitted a resignation for your review.', teamUrl);
      }
      break;
    case 'pm_rejected':
      await notifyUsers([employeeUserId], 'Resignation Rejected', 'Your project manager rejected your resignation request.', url);
      break;
    case 'pm_discussion':
      await notifyUsers([employeeUserId], 'Discussion Requested', 'Your project manager requested a discussion about your resignation.', url);
      break;
    case 'pm_approved_hr':
      await notifyUsers([employeeUserId], 'Manager Approved', 'Your resignation was approved by your project manager and forwarded to HR.', url);
      await notifyUsers(hrIds, 'Resignation — HR Review', 'A resignation request requires HR review.', hrUrl);
      break;
    case 'pm_approved_gm':
      await notifyUsers(gmIds, 'Retention Review Required', 'A retention proposal requires GM/Director review.', teamUrl);
      await notifyUsers(hrIds, 'Retention Case Started', 'A resignation has a retention proposal pending GM review.', hrUrl);
      break;
    case 'gm_retention_approved':
      await notifyUsers([employeeUserId], 'Retention Offer', 'A retention offer is available for your review.', url);
      break;
    case 'gm_retention_rejected':
      await notifyUsers(hrIds, 'Retention Rejected — HR Review', 'GM rejected retention; HR review required.', hrUrl);
      break;
    case 'employee_retention_accepted':
      await notifyUsers(hrIds, 'Resignation Withdrawn', 'Employee accepted retention offer; resignation withdrawn.', hrUrl);
      if (projectManagerId) await notifyUsers([projectManagerId], 'Resignation Withdrawn', 'Employee accepted retention offer.', teamUrl);
      break;
    case 'employee_retention_rejected':
      await notifyUsers(hrIds, 'Employee Declined Retention', 'Employee declined retention; HR review continues.', hrUrl);
      break;
    case 'hr_rejected':
      await notifyUsers([employeeUserId], 'Resignation Rejected by HR', 'HR rejected your resignation request.', url);
      break;
    case 'hr_approved_finance':
      await notifyUsers(financeIds, 'Finance Clearance Required', 'A resignation requires finance clearance.', financeUrl);
      await notifyUsers([employeeUserId], 'HR Approved', 'HR approved your resignation; finance clearance in progress.', url);
      break;
    case 'finance_rejected':
      await notifyUsers(hrIds, 'Finance Clearance Rejected', 'Finance rejected clearance; review required.', hrUrl);
      await notifyUsers([employeeUserId], 'Finance Clearance Issue', 'Finance reported an issue with your clearance.', url);
      break;
    case 'finance_hold':
      await notifyUsers(hrIds, 'Finance On Hold', 'Finance placed resignation clearance on hold.', hrUrl);
      break;
    case 'finance_approved':
      await notifyUsers(hrIds, 'Finance Cleared — HR Final', 'Finance cleared; HR final clearance required.', hrUrl);
      break;
    case 'hr_final_completed':
      await notifyUsers([employeeUserId], 'Resignation Completed', 'Your resignation process is complete.', url);
      break;
    case 'hr_final_rejected':
      await notifyUsers([employeeUserId], 'HR Final Rejection', 'HR rejected final clearance.', url);
      break;
    default:
      break;
  }
}

export async function transitionResignationStage(params: {
  resignationId: string;
  actorId?: string | null;
  action: string;
  newStage: ResignationWorkflowStage;
  newStatus?: ResignationStatus;
  comment?: string | null;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const existing = await prisma.resignationRequest.findUnique({
    where: { id: params.resignationId },
    select: { workflowStage: true },
  });
  if (!existing) throw new Error('NOT_FOUND');

  await prisma.resignationRequest.update({
    where: { id: params.resignationId },
    data: {
      workflowStage: params.newStage,
      ...(params.newStatus ? { status: params.newStatus } : {}),
      ...(params.data || {}),
    },
  });

  await appendResignationLog({
    resignationId: params.resignationId,
    actorId: params.actorId,
    action: params.action,
    previousStage: existing.workflowStage,
    newStage: params.newStage,
    comment: params.comment,
    metadata: params.metadata,
  });
}

export async function finalizeResignation(resignationId: string, actorId: string, comment?: string): Promise<void> {
  const req = await prisma.resignationRequest.findUnique({
    where: { id: resignationId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!req) throw new Error('NOT_FOUND');

  const exitDate = req.intendedLastWorkingDay;

  await prisma.$transaction([
    prisma.resignationRequest.update({
      where: { id: resignationId },
      data: {
        workflowStage: 'RESIGNATION_COMPLETED',
        status: 'COMPLETED',
        finalExitDate: exitDate,
        hrFinalById: actorId,
        hrFinalAt: new Date(),
        hrFinalComments: comment?.trim() || null,
        settlementRequestRef: `SET-${resignationId.slice(0, 8).toUpperCase()}`,
      },
    }),
    prisma.user.update({
      where: { id: req.userId },
      data: {
        isActive: false,
        exitDate,
        status: 'Inactive',
      },
    }),
  ]);

  await appendResignationLog({
    resignationId,
    actorId,
    action: 'HR_FINAL_APPROVED',
    previousStage: req.workflowStage,
    newStage: 'RESIGNATION_COMPLETED',
    comment,
    metadata: { exitDate, deactivated: true },
  });
}

export function defaultAssetChecklist() {
  return {
    laptopReturned: false,
    mobilePhoneReturned: false,
    simCardReturned: false,
    accessCardReturned: false,
    keysReturned: false,
    companyDocumentsReturned: false,
    otherAssetsReturned: false,
    otherAssetsNotes: '',
  };
}

export function defaultExitChecklist() {
  return {
    handoverCompleted: false,
    knowledgeTransferCompleted: false,
    exitInterviewCompleted: false,
  };
}

export function defaultFinanceChecklist() {
  return {
    salaryAdvances: '',
    employeeLoans: '',
    reimbursements: '',
    pettyCash: '',
    creditCards: '',
    liabilities: '',
    pendingDeductions: '',
  };
}

export const resignationInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      position: true,
      jobTitle: true,
      employeeId: true,
      managerId: true,
      joiningDate: true,
      exitDate: true,
      photo: true,
    },
  },
  assignedProjectManager: { select: { id: true, firstName: true, lastName: true, email: true } },
  pmActionBy: { select: { id: true, firstName: true, lastName: true } },
  gmActionBy: { select: { id: true, firstName: true, lastName: true } },
  hrReviewBy: { select: { id: true, firstName: true, lastName: true } },
  financeActionBy: { select: { id: true, firstName: true, lastName: true } },
  hrFinalBy: { select: { id: true, firstName: true, lastName: true } },
  workflowLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
  },
};

export function isHrRole(role: string | undefined): boolean {
  return role === 'HR' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function isFinanceUser(userId: string): Promise<boolean> {
  const ids = await getFinanceClearanceUserIds();
  return ids.includes(userId);
}

export async function canActAsProjectManager(
  resignationUserId: string,
  actorId: string,
  assignedPmId: string | null,
): Promise<boolean> {
  if (assignedPmId === actorId) return true;
  const emp = await prisma.user.findUnique({
    where: { id: resignationUserId },
    select: { managerId: true },
  });
  return emp?.managerId === actorId;
}

export async function isGeneralManagerUser(userId: string): Promise<boolean> {
  const ids = await getGeneralManagerUserIds();
  return ids.includes(userId);
}
