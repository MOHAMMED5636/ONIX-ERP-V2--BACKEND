import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { PayrollApprovalStage, PayrollStatus } from '@prisma/client';
import {
  createPayrollRunService,
  adjustPayrollLineService,
  approvePayrollRunStageService,
  lockPayrollRunService,
  generatePayslipsForRunService,
} from '../services/payrollWorkflow.service';

const isHrAdmin = (role: string | undefined): boolean => role === 'ADMIN' || role === 'HR';
const isSelfReadOnlyRole = (role: string | undefined): boolean =>
  role === 'MANAGER' || role === 'EMPLOYEE' || role === 'PROJECT_MANAGER';

const getUserOrThrow = (req: AuthRequest): { id: string; role: string } => {
  if (!req.user?.id || !req.user?.role) {
    throw new Error('Unauthorized');
  }
  return { id: req.user.id, role: req.user.role };
};

const parseRequiredDate = (value: unknown): Date | null => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
};

const parseIntRequired = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * Self payslips (finalized payroll lines only).
 * GET /api/payroll/self
 */
export const getSelfPayslips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isSelfReadOnlyRole(user.role) && !isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const lines = await prisma.payrollLine.findMany({
      where: {
        employeeId: user.id,
        payrollRun: { status: { in: [PayrollStatus.FINAL_APPROVED, PayrollStatus.LOCKED] } },
      },
      include: {
        payrollRun: { select: { id: true, periodStart: true, periodEnd: true, periodMonth: true, periodYear: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { lines } });
  } catch (error) {
    console.error('getSelfPayslips error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payslips' });
  }
};

/**
 * Get payroll lines for a run.
 * - HR/Admin: all lines
 * - Manager/Employee: only their own line(s)
 *
 * GET /api/payroll/runs/:runId/lines
 */
export const getRunLines = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    const { runId } = req.params;

    // Managers/Employees must not access payroll run details/processing endpoints.
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const lines = await prisma.payrollLine.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { lines } });
  } catch (error) {
    console.error('getRunLines error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payroll lines' });
  }
};

/**
 * Create payroll run (prepare).
 * POST /api/payroll/runs
 */
export const createPayrollRun = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const {
      periodStart,
      periodEnd,
      periodMonth,
      periodYear,
    } = req.body as any;

    const ps = parseRequiredDate(periodStart);
    const pe = parseRequiredDate(periodEnd);
    const pm = parseIntRequired(periodMonth);
    const py = parseIntRequired(periodYear);

    if (!ps || !pe || pm == null || py == null) {
      res.status(400).json({ success: false, message: 'Invalid period data' });
      return;
    }

    const run = await createPayrollRunService({
      userId: user.id,
      periodStart: ps,
      periodEnd: pe,
      periodMonth: pm,
      periodYear: py,
    });

    res.json({ success: true, data: run });
  } catch (error) {
    console.error('createPayrollRun error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create payroll run';
    const code = (error as any)?.code;
    res.status(code === 'DUPLICATE_PAYROLL_RUN' ? 409 : 500).json({ success: false, message: msg });
  }
};

/**
 * Manual adjustment for a payroll line.
 * PATCH /api/payroll/runs/:runId/lines/:lineId/adjustment
 */
export const adjustPayrollLine = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { runId, lineId } = req.params;
    const { delta, adjustmentDelta, notes } = req.body as any;

    const adj = adjustmentDelta != null ? adjustmentDelta : delta;
    const deltaNum = typeof adj === 'number' ? adj : Number(adj);
    if (!Number.isFinite(deltaNum)) {
      res.status(400).json({ success: false, message: 'Invalid delta' });
      return;
    }

    const updated = await adjustPayrollLineService({
      userId: user.id,
      runId,
      lineId,
      adjustmentDelta: deltaNum,
      notes: notes != null ? String(notes) : undefined,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('adjustPayrollLine error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to adjust payroll line';
    const code = (error as any)?.code;
    res.status(code === 'LOCKED' ? 409 : 500).json({ success: false, message: msg });
  }
};

/**
 * Approve payroll by stage.
 * POST /api/payroll/runs/:runId/approve
 */
export const approvePayrollRun = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { runId } = req.params;
    const { stage, approved, comments } = req.body as any;

    const approvedStage = stage as PayrollApprovalStage;
    const isApproved = approved === true || approved === 'true';

    if (![PayrollApprovalStage.HR_REVIEW, PayrollApprovalStage.FINANCE_REVIEW, PayrollApprovalStage.FINAL_APPROVAL].includes(approvedStage)) {
      res.status(400).json({ success: false, message: 'Invalid stage' });
      return;
    }

    const updatedRun = await approvePayrollRunStageService({
      userId: user.id,
      runId,
      stage: approvedStage,
      approved: isApproved,
      comments,
    });

    res.json({ success: true, data: updatedRun });
  } catch (error) {
    console.error('approvePayrollRun error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to approve payroll run';
    const code = (error as any)?.code;
    res.status(code === 'LOCKED' ? 409 : 500).json({ success: false, message: msg });
  }
};

/**
 * Lock payroll run (usually after final approval).
 * POST /api/payroll/runs/:runId/lock
 */
export const lockPayrollRun = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { runId } = req.params;
    const updated = await lockPayrollRunService({ userId: user.id, runId });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('lockPayrollRun error:', error);
    res.status(500).json({ success: false, message: 'Failed to lock payroll run' });
  }
};

/**
 * Generate payslips (mark generated + set a placeholder payslipPath)
 * POST /api/payroll/runs/:runId/payslips/generate
 */
export const generatePayslipsForRun = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { runId } = req.params;
    const result = await generatePayslipsForRunService({ userId: user.id, runId });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('generatePayslipsForRun error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate payslips';
    const code = (error as any)?.code;
    res.status(code === 'INVALID_STATUS' ? 409 : 500).json({ success: false, message: msg });
  }
};

const MINIMAL_PDF_BYTES = Buffer.from(
  '%PDF-1.3\n1 0 obj<<>>endobj\n2 0 obj<< /Type /Catalog /Pages 3 0 R >>endobj\n3 0 obj<< /Type /Pages /Count 0 >>endobj\ntrailer<< /Root 2 0 R >>\n%%EOF',
  'utf8',
);

const sendMinimalPdf = (res: Response) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', MINIMAL_PDF_BYTES.length);
  res.send(MINIMAL_PDF_BYTES);
};

/**
 * GET payroll settings (HR/Admin)
 * GET /api/payroll/settings
 */
export const getPayrollSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const settings = await prisma.payrollSettings.findFirst({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: settings ?? {} });
  } catch (error) {
    console.error('getPayrollSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payroll settings' });
  }
};

/**
 * PUT payroll settings (HR/Admin)
 * PUT /api/payroll/settings
 */
export const updatePayrollSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const payload = req.body as any;
    const {
      gracePeriodMinutes,
      lateDeductionPerMinute,
      absenceDeductionType,
      absenceDeductionValue,
      unpaidLeaveDeductionType,
      unpaidLeaveDeductionValue,
    } = payload;

    const existing = await prisma.payrollSettings.findFirst({ orderBy: { createdAt: 'desc' } });

    const saved = await prisma.payrollSettings.upsert({
      where: existing ? { id: existing.id } : ({ id: 'upsert-placeholder' } as any),
      // If there is no existing record, create a new one using defaults from payload
      create: {
        gracePeriodMinutes: gracePeriodMinutes ?? 15,
        lateDeductionPerMinute: lateDeductionPerMinute ?? 0.5,
        absenceDeductionType: absenceDeductionType ?? 'DAILY',
        absenceDeductionValue: absenceDeductionValue ?? 1.0,
        unpaidLeaveDeductionType: unpaidLeaveDeductionType ?? 'DAILY',
        unpaidLeaveDeductionValue: unpaidLeaveDeductionValue ?? 1.0,
        updatedBy: user.id,
      },
      update: {
        gracePeriodMinutes: gracePeriodMinutes ?? undefined,
        lateDeductionPerMinute: lateDeductionPerMinute ?? undefined,
        absenceDeductionType: absenceDeductionType ?? undefined,
        absenceDeductionValue: absenceDeductionValue ?? undefined,
        unpaidLeaveDeductionType: unpaidLeaveDeductionType ?? undefined,
        unpaidLeaveDeductionValue: unpaidLeaveDeductionValue ?? undefined,
        updatedBy: user.id,
      } as any,
    });

    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('updatePayrollSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payroll settings' });
  }
};

/**
 * GET payroll runs list (HR/Admin)
 * GET /api/payroll/runs?page=&limit=&status=&year=&month=&search=
 */
export const listPayrollRuns = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const {
      page = '1',
      limit = '10',
      status,
      year,
      month,
      search,
    } = req.query as any;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) where.status = status as PayrollStatus;
    if (year) where.periodYear = parseInt(year, 10);
    if (month) where.periodMonth = parseInt(month, 10);
    if (search) {
      where.OR = [
        { id: { contains: search as string, mode: 'insensitive' } },
        { periodYear: { equals: parseInt(search as string, 10) } },
      ];
    }

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payrollRun.count({ where }),
    ]);

    res.json({
      success: true,
      data: runs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('listPayrollRuns error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payroll runs' });
  }
};

/**
 * GET single payroll run (HR/Admin)
 * GET /api/payroll/runs/:id
 */
export const getPayrollRun = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const { id } = req.params;
    const run = await prisma.payrollRun.findUnique({ where: { id } });
    if (!run) {
      res.status(404).json({ success: false, message: 'Payroll run not found' });
      return;
    }
    res.json({ success: true, data: run });
  } catch (error) {
    console.error('getPayrollRun error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payroll run' });
  }
};

/**
 * PUT payroll line manual adjustments (HR/Admin)
 * PUT /api/payroll/runs/:id/lines/:lineId
 */
export const updatePayrollLine = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { id: runId, lineId } = req.params;
    const { manualAdjustments, adjustmentNotes } = req.body as any;
    const newManual = Number(manualAdjustments ?? 0);

    const existingLine = await prisma.payrollLine.findUnique({
      where: { id: lineId },
      select: { payrollRunId: true, manualAdjustments: true },
    });
    if (!existingLine || existingLine.payrollRunId !== runId) {
      res.status(404).json({ success: false, message: 'Payroll line not found' });
      return;
    }

    const currentManual = Number(existingLine.manualAdjustments ?? 0);
    const delta = newManual - currentManual;

    const updated = await adjustPayrollLineService({
      userId: user.id,
      runId,
      lineId,
      adjustmentDelta: delta,
      notes: adjustmentNotes != null ? String(adjustmentNotes) : undefined,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updatePayrollLine error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payroll line' });
  }
};

/**
 * Approve HR stage
 * POST /api/payroll/runs/:id/approve/hr
 */
export const approvePayrollHR = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }
    const { id } = req.params;
    const { comments } = req.body as any;
    const updatedRun = await approvePayrollRunStageService({
      userId: user.id,
      runId: id,
      stage: PayrollApprovalStage.HR_REVIEW,
      approved: true,
      comments,
    });
    res.json({ success: true, data: updatedRun });
  } catch (error) {
    console.error('approvePayrollHR error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve HR stage' });
  }
};

/**
 * Approve Finance stage
 * POST /api/payroll/runs/:id/approve/finance
 */
export const approvePayrollFinance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }
    const { id } = req.params;
    const { comments } = req.body as any;
    const updatedRun = await approvePayrollRunStageService({
      userId: user.id,
      runId: id,
      stage: PayrollApprovalStage.FINANCE_REVIEW,
      approved: true,
      comments,
    });
    res.json({ success: true, data: updatedRun });
  } catch (error) {
    console.error('approvePayrollFinance error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve Finance stage' });
  }
};

/**
 * Approve Final stage
 * POST /api/payroll/runs/:id/approve/final
 */
export const approvePayrollFinal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }
    const { id } = req.params;
    const { comments } = req.body as any;
    const updatedRun = await approvePayrollRunStageService({
      userId: user.id,
      runId: id,
      stage: PayrollApprovalStage.FINAL_APPROVAL,
      approved: true,
      comments,
    });
    res.json({ success: true, data: updatedRun });
  } catch (error) {
    console.error('approvePayrollFinal error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve Final stage' });
  }
};

/**
 * Generate payslip PDF for a specific employee (HR/Admin)
 * GET /api/payroll/runs/:id/payslip/:employeeId
 */
export const generatePayslip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const { id: runId, employeeId } = req.params;

    await prisma.payrollLine.updateMany({
      where: { payrollRunId: runId, employeeId },
      data: {
        payslipGenerated: true,
        payslipGeneratedAt: new Date(),
        payslipPath: `/uploads/payslips/${runId}/${employeeId}.pdf`,
      },
    });

    sendMinimalPdf(res);
  } catch (error) {
    console.error('generatePayslip error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate payslip' });
  }
};

/**
 * Generate payroll register PDF (HR/Admin)
 * GET /api/payroll/runs/:id/register
 */
export const generateRegister = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    // Currently returns a minimal PDF placeholder.
    sendMinimalPdf(res);
  } catch (error) {
    console.error('generateRegister error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate register' });
  }
};

