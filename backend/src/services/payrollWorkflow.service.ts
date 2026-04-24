import prisma from '../config/database';
import {
  PayrollApprovalStage,
  PayrollStatus,
  UserRole,
  type PayrollAuditLog,
  type PayrollApproval,
} from '@prisma/client';
import { calculatePayrollLineForEmployee, DEFAULT_SETTINGS } from './payrollCalculation.service';

type CreatePayrollRunInput = {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  periodMonth: number;
  periodYear: number;
};

type AdjustmentInput = {
  userId: string;
  runId: string;
  lineId: string;
  adjustmentDelta: number;
  notes?: string;
};

type ApproveInput = {
  userId: string;
  runId: string;
  stage: PayrollApprovalStage;
  approved: boolean;
  comments?: string;
};

const parseMoney = (value: unknown): number => {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

function nowIso(): Date {
  return new Date();
}

function payslipPathPlaceholder(runId: string, employeeId: string): string {
  // This repo currently doesn't generate PDFs on the backend.
  // We keep a stable path so the frontend can later download real files.
  return `/uploads/payslips/${runId}/${employeeId}.pdf`;
}

export async function createPayrollRunService(input: CreatePayrollRunInput) {
  const settings = await prisma.payrollSettings.findFirst({ orderBy: { createdAt: 'desc' } });
  const payrollSettings = settings
    ? {
        gracePeriodMinutes: Number(settings.gracePeriodMinutes),
        lateDeductionPerMinute: Number(settings.lateDeductionPerMinute),
        absenceDeductionType: settings.absenceDeductionType,
        absenceDeductionValue: Number(settings.absenceDeductionValue),
        unpaidLeaveDeductionType: settings.unpaidLeaveDeductionType,
        unpaidLeaveDeductionValue: Number(settings.unpaidLeaveDeductionValue),
      }
    : DEFAULT_SETTINGS;

  // Employees & managers get payroll; HR/Admin don't get included in "employee payroll runs".
  const employees = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.PROJECT_MANAGER] },
    },
    select: { id: true },
  });

  const payrollRunExisting = await prisma.payrollRun.findUnique({
    where: { periodMonth_periodYear: { periodMonth: input.periodMonth, periodYear: input.periodYear } },
  });

  if (payrollRunExisting) {
    const err = new Error('Payroll run already exists for this month/year');
    (err as any).code = 'DUPLICATE_PAYROLL_RUN';
    throw err;
  }

  const payrollRun = await prisma.payrollRun.create({
    data: {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodMonth: input.periodMonth,
      periodYear: input.periodYear,
      status: PayrollStatus.HR_PENDING,
      settingsSnapshot: JSON.parse(JSON.stringify(payrollSettings)),
      createdById: input.userId,
    },
  });

  const linesToCreate: any[] = [];
  for (const emp of employees) {
    const line = await calculatePayrollLineForEmployee({
      employeeId: emp.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      payrollSettings,
    });
    if (!line) continue; // skip employees without active salary structure
    linesToCreate.push({ payrollRunId: payrollRun.id, ...line });
  }

  for (const payload of linesToCreate) {
    await prisma.payrollLine.create({ data: payload });
  }

  const totals = linesToCreate.reduce(
    (acc, l) => {
      acc.totalGross += Number(l.grossSalary ?? 0);
      acc.totalDeductions += Number(l.totalDeductions ?? 0);
      acc.totalNet += Number(l.netSalary ?? 0);
      return acc;
    },
    { totalGross: 0, totalDeductions: 0, totalNet: 0 },
  );

  await prisma.payrollRun.update({
    where: { id: payrollRun.id },
    data: {
      totalEmployees: linesToCreate.length,
      totalGross: totals.totalGross,
      totalDeductions: totals.totalDeductions,
      totalNet: totals.totalNet,
    },
  });

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId: payrollRun.id,
      action: 'CREATE_PAYROLL_RUN',
      performedById: input.userId,
      details: {
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
        employeesIncluded: linesToCreate.length,
      },
    },
  });

  return prisma.payrollRun.findUnique({
    where: { id: payrollRun.id },
    include: {
      lines: {
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeId: true, department: true },
          },
        },
      },
      approvals: true,
    },
  });
}

export async function adjustPayrollLineService(input: AdjustmentInput) {
  const payrollRun = await prisma.payrollRun.findUnique({
    where: { id: input.runId },
    select: { status: true },
  });
  if (!payrollRun) {
    const err = new Error('Payroll run not found');
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (payrollRun.status === PayrollStatus.LOCKED) {
    const err = new Error('Payroll is locked');
    (err as any).code = 'LOCKED';
    throw err;
  }

  const line = await prisma.payrollLine.findUnique({
    where: { id: input.lineId },
    select: {
      payrollRunId: true,
      grossSalary: true,
      totalDeductions: true,
      manualAdjustments: true,
    },
  });

  if (!line || line.payrollRunId !== input.runId) {
    const err = new Error('Payroll line not found');
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  const delta = parseMoney(input.adjustmentDelta);
  const newManual = Number(line.manualAdjustments ?? 0) + delta;
  const newTotalDeductions = Number(line.totalDeductions ?? 0) + delta;
  const newNet = Number(line.grossSalary ?? 0) - newTotalDeductions;

  const updated = await prisma.payrollLine.update({
    where: { id: input.lineId },
    data: {
      manualAdjustments: newManual,
      totalDeductions: newTotalDeductions,
      netSalary: newNet,
      adjustmentNotes: input.notes ?? undefined,
    },
  });

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId: input.runId,
      action: 'MANUAL_ADJUSTMENT',
      performedById: input.userId,
      details: { lineId: input.lineId, delta, notes: input.notes ?? null },
    },
  });

  return updated;
}

export async function approvePayrollRunStageService(input: ApproveInput) {
  const payrollRun = await prisma.payrollRun.findUnique({ where: { id: input.runId } });
  if (!payrollRun) {
    const err = new Error('Payroll run not found');
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (payrollRun.status === PayrollStatus.LOCKED) {
    const err = new Error('Payroll is locked');
    (err as any).code = 'LOCKED';
    throw err;
  }

  const approvedAt = input.approved ? nowIso() : null;

  let updateData: any = {};
  if (input.approved) {
    if (input.stage === PayrollApprovalStage.HR_REVIEW) {
      updateData = { status: PayrollStatus.HR_APPROVED, hrApprovedById: input.userId, hrApprovedAt: approvedAt };
    } else if (input.stage === PayrollApprovalStage.FINANCE_REVIEW) {
      updateData = {
        status: PayrollStatus.FINANCE_APPROVED,
        financeApprovedById: input.userId,
        financeApprovedAt: approvedAt,
      };
    } else if (input.stage === PayrollApprovalStage.FINAL_APPROVAL) {
      updateData = {
        status: PayrollStatus.LOCKED,
        finalApprovedById: input.userId,
        finalApprovedAt: approvedAt,
        lockedAt: approvedAt,
      };
    }
  } else {
    // On rejection: keep the run mutable but mark it as draft.
    updateData = { status: PayrollStatus.DRAFT };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payrollApproval.create({
      data: {
        payrollRunId: input.runId,
        stage: input.stage,
        approvedById: input.approved ? input.userId : null,
        approvedAt: approvedAt ?? undefined,
        comments: input.comments ?? undefined,
        rejected: !input.approved,
        rejectionReason: !input.approved ? input.comments ?? undefined : undefined,
      },
    });

    await tx.payrollRun.update({
      where: { id: input.runId },
      data: updateData,
    });

    await tx.payrollAuditLog.create({
      data: {
        payrollRunId: input.runId,
        action: input.approved ? 'APPROVED_STAGE' : 'REJECTED_STAGE',
        performedById: input.userId,
        details: { stage: input.stage, approved: input.approved, comments: input.comments ?? null },
      },
    });
  });

  return prisma.payrollRun.findUnique({ where: { id: input.runId } });
}

export async function lockPayrollRunService(input: { userId: string; runId: string }) {
  const run = await prisma.payrollRun.findUnique({ where: { id: input.runId } });
  if (!run) {
    const err = new Error('Payroll run not found');
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (run.status === PayrollStatus.LOCKED) return run;

  const lockedAt = nowIso();
  const updated = await prisma.payrollRun.update({
    where: { id: input.runId },
    data: { status: PayrollStatus.LOCKED, lockedAt, finalApprovedAt: lockedAt, finalApprovedById: input.userId },
  });

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId: input.runId,
      action: 'LOCK_PAYROLL',
      performedById: input.userId,
      details: {},
    },
  });

  return updated;
}

export async function generatePayslipsForRunService(input: { userId: string; runId: string }) {
  const run = await prisma.payrollRun.findUnique({ where: { id: input.runId } });
  if (!run) {
    const err = new Error('Payroll run not found');
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (run.status !== PayrollStatus.LOCKED && run.status !== PayrollStatus.FINAL_APPROVED) {
    const err = new Error('Payslips can only be generated after final approval/lock');
    (err as any).code = 'INVALID_STATUS';
    throw err;
  }

  const lines = await prisma.payrollLine.findMany({
    where: { payrollRunId: input.runId },
    select: { id: true, employeeId: true },
  });

  const generatedAt = nowIso();
  let updatedCount = 0;
  for (const line of lines) {
    await prisma.payrollLine.update({
      where: { id: line.id },
      data: {
        payslipGenerated: true,
        payslipGeneratedAt: generatedAt,
        payslipPath: payslipPathPlaceholder(input.runId, line.employeeId),
      },
    });
    updatedCount += 1;
  }

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId: input.runId,
      action: 'PAYSLICES_GENERATED',
      performedById: input.userId,
      details: { count: updatedCount },
    },
  });

  return { updatedCount };
}

