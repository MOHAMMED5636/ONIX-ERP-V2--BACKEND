import prisma from '../config/database';
import { LeaveStatus, LeaveType, SalaryDeductionMode } from '@prisma/client';

type PayrollSettingsLike = {
  gracePeriodMinutes: number;
  lateDeductionPerMinute: number;
  absenceDeductionType: string;
  absenceDeductionValue: number;
  unpaidLeaveDeductionType: string;
  unpaidLeaveDeductionValue: number;
};

export const DEFAULT_SETTINGS: PayrollSettingsLike = {
  gracePeriodMinutes: 15,
  lateDeductionPerMinute: 0.5,
  absenceDeductionType: 'DAILY',
  absenceDeductionValue: 1.0,
  unpaidLeaveDeductionType: 'DAILY',
  unpaidLeaveDeductionValue: 1.0,
};

function toDayKey(d: Date): string {
  // attendance.date is stored as DATE, but in JS it can still include time components
  return d.toISOString().slice(0, 10);
}

function differenceDaysInclusive(start: Date, end: Date): number {
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

function applyDeductionMode(params: {
  mode: SalaryDeductionMode;
  value: number;
  baseAmount: number;
  unitAmount: number;
}): number {
  const { mode, value, baseAmount, unitAmount } = params;
  if (!Number.isFinite(value)) return 0;

  switch (mode) {
    case 'FIXED':
      return value;
    case 'PER_DAY':
      return value * unitAmount;
    case 'PER_MINUTE':
      return value * unitAmount;
    case 'PERCENTAGE':
      return (baseAmount * value) / 100;
    default:
      return 0;
  }
}

export async function calculatePayrollLineForEmployee(params: {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  payrollSettings: PayrollSettingsLike;
}) {
  const { employeeId, periodStart, periodEnd, payrollSettings } = params;

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { department: true },
  });
  if (!employee) return null;

  const salaryStructure = await prisma.salaryStructure.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: periodStart },
    },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      allowances: true,
      deductions: true,
      increments: false,
    },
  });

  if (!salaryStructure) return null;

  const basicSalary = Number(salaryStructure.basicSalary ?? 0);

  const allowances = salaryStructure.allowances ?? [];
  const totalAllowances = allowances.reduce((sum, a) => sum + Number(a.amount ?? 0), 0);

  // Map allowance types into the two snapshot buckets the PayrollLine model currently supports.
  // Adjust later if the UI requires a different breakdown.
  const snapshotAllowance1 =
    allowances
      .filter((a) => a.allowanceType === 'HRA' || a.allowanceType === 'BONUS' || a.allowanceType === 'OTHER')
      .reduce((sum, a) => sum + Number(a.amount ?? 0), 0) || 0;

  const snapshotAllowance2 =
    allowances.filter((a) => a.allowanceType === 'TRAVEL').reduce((sum, a) => sum + Number(a.amount ?? 0), 0) || 0;

  const grossSalary = basicSalary + totalAllowances;

  // Attendance summary
  const attendance = await prisma.attendance.findMany({
    where: {
      userId: employeeId,
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    select: { date: true, status: true },
  });

  const absentDayKeys = new Set(
    attendance.filter((a) => a.status === 'ABSENT').map((a) => toDayKey(a.date)),
  );
  const lateDayKeys = new Set(
    attendance.filter((a) => a.status === 'LATE').map((a) => toDayKey(a.date)),
  );
  const earlyDayKeys = new Set(
    attendance.filter((a) => a.status === 'EARLY_DEPARTURE').map((a) => toDayKey(a.date)),
  );

  const absentDays = absentDayKeys.size;
  const lateInstances = lateDayKeys.size;
  const earlyInstances = earlyDayKeys.size;

  // We don't store exact late minutes in Attendance, so we approximate "1 minute per late day".
  // If you later add expected/actual comparison, this can be improved.
  const totalLateMinutes = lateInstances * 1;
  const totalEarlyLeaveMinutes = earlyInstances * 1;

  // Leave summary (only approved)
  const leaves = await prisma.leave.findMany({
    where: {
      userId: employeeId,
      status: LeaveStatus.APPROVED,
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    select: { type: true, days: true },
  });

  const unpaidLeaveDays = leaves
    .filter((l) => l.type === LeaveType.UNPAID)
    .reduce((sum, l) => sum + Number(l.days ?? 0), 0);

  const paidLeaveDays = leaves
    .filter((l) => l.type !== LeaveType.UNPAID)
    .reduce((sum, l) => sum + Number(l.days ?? 0), 0);

  const dayCount = differenceDaysInclusive(periodStart, periodEnd);
  const totalWorkingDays = Math.max(0, dayCount - absentDays - paidLeaveDays - unpaidLeaveDays);

  // Salary deductions from configuration
  const deductions = salaryStructure.deductions ?? [];
  const leaveConfigs = deductions.filter((d) => d.deductionType === 'LEAVE');
  const lateConfigs = deductions.filter((d) => d.deductionType === 'LATE_PENALTY');
  const otherConfigs = deductions.filter((d) => d.deductionType === 'OTHER_MANUAL');
  const loanConfigs = deductions.filter((d) => d.deductionType === 'LOAN');

  let absenceDeduction = 0;
  let lateDeduction = 0;
  let unpaidLeaveDeduction = 0;
  let manualAdjustments = 0;

  // Absence/Unpaid leave deductions
  if (leaveConfigs.length > 0) {
    for (const cfg of leaveConfigs) {
      const value = Number(cfg.value ?? 0);
      const mode = cfg.mode ?? 'FIXED';

      // Split LEAVE deductions between absentDays and unpaidLeaveDays where it makes sense.
      if (mode === 'PER_DAY') {
        absenceDeduction += applyDeductionMode({ mode, value, baseAmount: grossSalary, unitAmount: absentDays });
        unpaidLeaveDeduction += applyDeductionMode({
          mode,
          value,
          baseAmount: grossSalary,
          unitAmount: unpaidLeaveDays,
        });
      } else {
        // FIXED or PERCENTAGE: apply to unpaidLeaveDeduction to avoid double-counting.
        unpaidLeaveDeduction += applyDeductionMode({ mode, value, baseAmount: grossSalary, unitAmount: 1 });
      }
    }
  } else {
    // Fallback to PayrollSettings if no configured salary LEAVE deductions exist.
    absenceDeduction =
      payrollSettings.absenceDeductionType === 'PERCENTAGE'
        ? (grossSalary * payrollSettings.absenceDeductionValue) / 100
        : payrollSettings.absenceDeductionValue * absentDays;

    unpaidLeaveDeduction =
      payrollSettings.unpaidLeaveDeductionType === 'PERCENTAGE'
        ? (grossSalary * payrollSettings.unpaidLeaveDeductionValue) / 100
        : payrollSettings.unpaidLeaveDeductionValue * unpaidLeaveDays;
  }

  // Late deduction
  if (lateConfigs.length > 0) {
    for (const cfg of lateConfigs) {
      const value = Number(cfg.value ?? 0);
      const mode = cfg.mode ?? 'FIXED';
      lateDeduction += applyDeductionMode({
        mode,
        value,
        baseAmount: grossSalary,
        unitAmount: totalLateMinutes,
      });
    }
  } else {
    lateDeduction = payrollSettings.lateDeductionPerMinute * totalLateMinutes;
  }

  // Loan + other manual deduction configs are treated as "manualAdjustments base".
  const manualConfigs = [...loanConfigs, ...otherConfigs];
  for (const cfg of manualConfigs) {
    const value = Number(cfg.value ?? 0);
    const mode = cfg.mode ?? 'FIXED';
    manualAdjustments += applyDeductionMode({
      mode,
      value,
      baseAmount: grossSalary,
      unitAmount: totalWorkingDays,
    });
  }

  const totalDeductions = absenceDeduction + lateDeduction + unpaidLeaveDeduction + manualAdjustments;
  const netSalary = grossSalary - totalDeductions;

  return {
    employeeId,
    snapshotEmployeeId: employeeId,
    snapshotBasicSalary: basicSalary,
    snapshotAllowance1,
    snapshotAllowance2,
    snapshotTotalAllowances: totalAllowances,
    snapshotDepartment: employee.department ?? null,

    grossSalary,
    totalDeductions,
    netSalary,

    totalWorkingDays,
    totalAbsentDays: absentDays,
    totalLateInstances: lateInstances,
    totalLateMinutes,
    totalEarlyLeaveMinutes,

    paidLeaveDays,
    unpaidLeaveDays,

    absenceDeduction,
    lateDeduction,
    unpaidLeaveDeduction,
    manualAdjustments,
    adjustmentNotes: null,

    payslipGenerated: false,
    payslipGeneratedAt: null,
    payslipPath: null,
  };
}

