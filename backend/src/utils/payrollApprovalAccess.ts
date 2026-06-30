import { PayrollApprovalStage, PayrollStatus } from '@prisma/client';

export function normalizePayrollRole(role: string | undefined): string {
  if (!role) return '';
  return String(role).trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** HR payroll module + run list/details. */
export function canViewPayrollRuns(role: string | undefined): boolean {
  const r = normalizePayrollRole(role);
  return r === 'ADMIN' || r === 'HR' || r === 'SUPER_ADMIN' || r === 'ACCOUNTANT';
}

export function canManagePayrollRuns(role: string | undefined): boolean {
  const r = normalizePayrollRole(role);
  return r === 'ADMIN' || r === 'HR' || r === 'SUPER_ADMIN';
}

const HR_REVIEW_STATUSES = new Set<PayrollStatus>([PayrollStatus.DRAFT, PayrollStatus.HR_PENDING]);
const FINANCE_REVIEW_STATUSES = new Set<PayrollStatus>([
  PayrollStatus.FINANCE_PENDING,
  PayrollStatus.HR_APPROVED, // legacy intermediate status
]);
const FINAL_REVIEW_STATUSES = new Set<PayrollStatus>([PayrollStatus.FINANCE_APPROVED]);

export function requiredStatusForApprovalStage(stage: PayrollApprovalStage): Set<PayrollStatus> {
  if (stage === PayrollApprovalStage.HR_REVIEW) return HR_REVIEW_STATUSES;
  if (stage === PayrollApprovalStage.FINANCE_REVIEW) return FINANCE_REVIEW_STATUSES;
  return FINAL_REVIEW_STATUSES;
}

export function canApprovePayrollStage(role: string | undefined, stage: PayrollApprovalStage): boolean {
  const r = normalizePayrollRole(role);
  if (stage === PayrollApprovalStage.HR_REVIEW) {
    return r === 'HR' || r === 'ADMIN' || r === 'SUPER_ADMIN';
  }
  if (stage === PayrollApprovalStage.FINANCE_REVIEW) {
    return r === 'ACCOUNTANT' || r === 'SUPER_ADMIN';
  }
  if (stage === PayrollApprovalStage.FINAL_APPROVAL) {
    return r === 'SUPER_ADMIN';
  }
  return false;
}

export function assertPayrollStageApprovalAllowed(input: {
  role: string | undefined;
  stage: PayrollApprovalStage;
  status: PayrollStatus;
}): void {
  if (!canApprovePayrollStage(input.role, input.stage)) {
    const err = new Error('You are not allowed to approve this payroll stage');
    (err as Error & { code?: string }).code = 'FORBIDDEN_STAGE';
    throw err;
  }

  const allowedStatuses = requiredStatusForApprovalStage(input.stage);
  if (!allowedStatuses.has(input.status)) {
    const err = new Error('Payroll run is not at the correct stage for this approval');
    (err as Error & { code?: string }).code = 'INVALID_STATUS';
    throw err;
  }
}

export function nextPayrollStatusAfterApproval(stage: PayrollApprovalStage): PayrollStatus {
  if (stage === PayrollApprovalStage.HR_REVIEW) return PayrollStatus.FINANCE_PENDING;
  if (stage === PayrollApprovalStage.FINANCE_REVIEW) return PayrollStatus.FINANCE_APPROVED;
  return PayrollStatus.FINAL_APPROVED;
}
