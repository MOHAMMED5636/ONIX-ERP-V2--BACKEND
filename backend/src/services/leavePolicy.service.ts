import prisma from '../config/database';
import { LeaveType } from '@prisma/client';

export interface LeavePolicyConfig {
  // Annual
  probationMonths?: number;
  daysPerMonthUnder12Months?: number;
  annualDaysAfter12Months?: number;
  carryForwardPeriods?: number;
  advanceNoticeDays?: number;
  maxRescheduleMonths?: number;
  // Sick
  totalDaysPerYear?: number;
  fullPayDays?: number;
  halfPayDays?: number;
  unpaidDays?: number;
  reportAbsenceWithinHours?: number;
  medicalReportWithinWorkingDays?: number;
  // Bereavement
  spouseDays?: number;
  firstDegreeDays?: number;
  relationOptions?: string[];
  // Paternity
  paidDays?: number;
  withinMonthsOfChildbirth?: number;
  // Maternity
  totalDays?: number;
  maternityFullPayDays?: number;
  maternityHalfPayDays?: number;
  maternityUnpaidDays?: number;
  extraUnpaidWithProof?: number;
  [key: string]: unknown;
}

export async function getActivePolicies() {
  return prisma.leavePolicy.findMany({
    where: { isActive: true },
    orderBy: { leaveType: 'asc' },
  });
}

/**
 * Compute annual leave entitlement for a user based on joining date and policy.
 * - After probation: 2 days per month for service < 12 months.
 * - After 12 months: 30 paid working days per year.
 */
export async function getAnnualEntitlement(userId: string): Promise<{ entitlement: number; fromCarryForward: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joiningDate: true, annualLeaveBalance: true },
  });
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'ANNUAL', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const probationMonths = config.probationMonths ?? 6;
  const daysPerMonth = config.daysPerMonthUnder12Months ?? 2;
  const annualDays = config.annualDaysAfter12Months ?? 30;

  const now = new Date();
  const joinDate = user?.joiningDate;
  if (!joinDate) {
    const fallback = user?.annualLeaveBalance ?? 25;
    return { entitlement: fallback, fromCarryForward: 0 };
  }

  const join = new Date(joinDate);
  join.setHours(0, 0, 0, 0);
  const monthsSinceJoin = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  const probationEnd = new Date(join);
  probationEnd.setMonth(probationEnd.getMonth() + probationMonths);

  let entitlement: number;
  if (monthsSinceJoin < 12) {
    const monthsAfterProbation = probationEnd > now ? 0 : Math.max(0, monthsSinceJoin - probationMonths);
    entitlement = monthsAfterProbation * daysPerMonth;
    entitlement = Math.min(entitlement, 24);
  } else {
    entitlement = annualDays;
  }

  const fromCarryForward = 0;
  return { entitlement: entitlement || (user?.annualLeaveBalance ?? 25), fromCarryForward };
}

/**
 * Compute annual entitlement for a specific year (for carry-forward).
 */
async function getEntitlementForYear(
  userId: string,
  year: number,
  config: LeavePolicyConfig
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joiningDate: true },
  });
  const joinDate = user?.joiningDate;
  if (!joinDate) return config.annualDaysAfter12Months ?? 30;

  const join = new Date(joinDate);
  const yearEnd = new Date(year, 11, 31);
  if (join > yearEnd) return 0;

  const probationMonths = config.probationMonths ?? 6;
  const daysPerMonth = config.daysPerMonthUnder12Months ?? 2;
  const annualDays = config.annualDaysAfter12Months ?? 30;

  const monthsByEndOfYear = (year - join.getFullYear()) * 12 + (11 - join.getMonth());
  if (monthsByEndOfYear >= 12) return annualDays;

  const probationEnd = new Date(join);
  probationEnd.setMonth(probationEnd.getMonth() + probationMonths);
  if (probationEnd > yearEnd) return 0;
  const monthsAfterProbation = Math.max(0, monthsByEndOfYear - probationMonths);
  return Math.min(monthsAfterProbation * daysPerMonth, 24);
}

/**
 * Get total annual entitlement including carry-forward (max 2 periods). Automatic deduction uses this balance.
 */
export async function getAnnualBalance(userId: string): Promise<{
  total: number;
  used: number;
  remaining: number;
  fromCarryForward?: number;
}> {
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'ANNUAL', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const annualDays = config.annualDaysAfter12Months ?? 30;
  const carryForwardPeriods = config.carryForwardPeriods ?? 2;

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31);

  const [currentEntitlementResult, usedCurrent, usedPrev1, usedPrev2] = await Promise.all([
    getAnnualEntitlement(userId),
    prisma.leave.aggregate({
      where: {
        userId,
        type: 'ANNUAL',
        status: 'APPROVED',
        startDate: { gte: yearStart },
        endDate: { lte: yearEnd },
      },
      _sum: { days: true },
    }),
    prisma.leave.aggregate({
      where: {
        userId,
        type: 'ANNUAL',
        status: 'APPROVED',
        startDate: { gte: new Date(currentYear - 1, 0, 1) },
        endDate: { lte: new Date(currentYear - 1, 11, 31) },
      },
      _sum: { days: true },
    }),
    prisma.leave.aggregate({
      where: {
        userId,
        type: 'ANNUAL',
        status: 'APPROVED',
        startDate: { gte: new Date(currentYear - 2, 0, 1) },
        endDate: { lte: new Date(currentYear - 2, 11, 31) },
      },
      _sum: { days: true },
    }),
  ]);

  let total = currentEntitlementResult.entitlement;
  let fromCarryForward = 0;

  if (carryForwardPeriods >= 1) {
    const ent1 = await getEntitlementForYear(userId, currentYear - 1, config);
    const rem1 = Math.max(0, ent1 - (usedPrev1._sum.days ?? 0));
    const carry1 = Math.min(rem1, annualDays);
    total += carry1;
    fromCarryForward += carry1;
  }
  if (carryForwardPeriods >= 2) {
    const ent2 = await getEntitlementForYear(userId, currentYear - 2, config);
    const rem2 = Math.max(0, ent2 - (usedPrev2._sum.days ?? 0));
    const carry2 = Math.min(rem2, annualDays);
    total += carry2;
    fromCarryForward += carry2;
  }

  const usedDays = usedCurrent._sum.days ?? 0;
  return {
    total,
    used: usedDays,
    remaining: Math.max(0, total - usedDays),
    fromCarryForward,
  };
}

/**
 * Validate annual leave: balance, advance notice (30 days), working days.
 */
export async function validateAnnualLeave(
  userId: string,
  startDate: Date,
  endDate: Date,
  days: number
): Promise<{ valid: boolean; message?: string }> {
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'ANNUAL', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const advanceNoticeDays = config.advanceNoticeDays ?? 30;

  const minStart = new Date();
  minStart.setDate(minStart.getDate() + advanceNoticeDays);
  if (startDate < minStart) {
    return {
      valid: false,
      message: `Annual leave must be submitted at least ${advanceNoticeDays} days in advance`,
    };
  }

  const balance = await getAnnualBalance(userId);
  if (days > balance.remaining) {
    return {
      valid: false,
      message: `Insufficient annual leave balance. Remaining: ${balance.remaining} days`,
    };
  }
  return { valid: true };
}

/**
 * Validate sick leave: total 90 days per year (15 full, 30 half, 45 unpaid).
 */
export async function validateSickLeave(
  userId: string,
  startDate: Date,
  endDate: Date,
  days: number
): Promise<{ valid: boolean; message?: string }> {
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'SICK', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const totalAllowed = config.totalDaysPerYear ?? 90;

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const yearEnd = new Date(new Date().getFullYear(), 11, 31);
  const used = await prisma.leave.aggregate({
    where: {
      userId,
      type: 'SICK',
      status: 'APPROVED',
      startDate: { gte: yearStart },
      endDate: { lte: yearEnd },
    },
    _sum: { days: true },
  });
  const usedDays = used._sum.days ?? 0;
  if (usedDays + days > totalAllowed) {
    return {
      valid: false,
      message: `Sick leave cannot exceed ${totalAllowed} days per year. Already used: ${usedDays} days.`,
    };
  }
  return { valid: true };
}

/**
 * Bereavement: 5 days spouse, 3 days first-degree. relationOrContext required.
 */
export async function validateBereavementLeave(
  days: number,
  relationOrContext: string | null | undefined
): Promise<{ valid: boolean; message?: string }> {
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'BEREAVEMENT', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const spouseDays = config.spouseDays ?? 5;
  const firstDegreeDays = config.firstDegreeDays ?? 3;

  const relation = (relationOrContext || '').toLowerCase().replace(/\s+/g, '_');
  if (!relation || !['spouse', 'first_degree'].some((r) => relation.includes(r))) {
    return {
      valid: false,
      message: 'Bereavement leave requires relation: spouse (5 days) or first_degree (3 days)',
    };
  }
  const maxDays = relation.includes('spouse') ? spouseDays : firstDegreeDays;
  if (days > maxDays) {
    return { valid: false, message: `Maximum ${maxDays} days for this relation` };
  }
  return { valid: true };
}

/**
 * Paternity: 5 paid days, within 6 months of childbirth.
 */
export async function validatePaternityLeave(days: number): Promise<{ valid: boolean; message?: string }> {
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'PATERNITY', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const paidDays = config.paidDays ?? 5;
  if (days > paidDays) {
    return { valid: false, message: `Paternity leave is limited to ${paidDays} paid days` };
  }
  return { valid: true };
}

/**
 * Maternity: 105 days total (45 full, 15 half, 45 unpaid); optional 45 extra unpaid with proof.
 */
export async function validateMaternityLeave(
  days: number,
  isExtraUnpaidWithProof?: boolean
): Promise<{ valid: boolean; message?: string }> {
  const policy = await prisma.leavePolicy.findUnique({
    where: { leaveType: 'MATERNITY', isActive: true },
  });
  const config = (policy?.config as LeavePolicyConfig) || {};
  const totalDays = config.totalDays ?? 105;
  const extraUnpaid = config.extraUnpaidWithProof ?? 45;
  const maxTotal = totalDays + (isExtraUnpaidWithProof ? extraUnpaid : 0);
  if (days > maxTotal) {
    return {
      valid: false,
      message: `Maternity leave cannot exceed ${maxTotal} days${isExtraUnpaidWithProof ? ' (including extra unpaid with proof)' : ''}`,
    };
  }
  return { valid: true };
}

export const VALID_LEAVE_TYPES: LeaveType[] = [
  'ANNUAL',
  'SICK',
  'UNPAID',
  'EMERGENCY',
  'BEREAVEMENT',
  'PATERNITY',
  'MATERNITY',
];
