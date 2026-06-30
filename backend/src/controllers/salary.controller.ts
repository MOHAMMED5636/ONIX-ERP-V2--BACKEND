import { Response } from 'express';
import {
  Prisma,
  SalaryAllowanceType,
  SalaryAuditAction,
  SalaryDeductionMode,
  SalaryDeductionType,
  SalaryIncrementType,
} from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getMonthlySalarySheet as getMonthlySalarySheetService,
  saveMonthlySalarySheet as saveMonthlySalarySheetService,
  createPayrollRunFromMonthlySheet as createPayrollRunFromMonthlySheetService,
  publishMonthlySalaryToEmployees as publishMonthlySalaryToEmployeesService,
  unpublishMonthlySalaryForPeriod as unpublishMonthlySalaryForPeriodService,
  getEmployeePublishedPayslips as getEmployeePublishedPayslipsService,
  getEmployeePublishedPayslipDetail as getEmployeePublishedPayslipDetailService,
  createSalaryPayslipRequest as createSalaryPayslipRequestService,
  listSalaryPayslipRequests as listSalaryPayslipRequestsService,
  respondToSalaryPayslipRequest as respondToSalaryPayslipRequestService,
} from '../services/salary-monthly-sheet.service';
import {
  canViewSalaryIntelligence,
  getEmployeeSalaryIntelligenceDetail,
  getSalaryIntelligenceDashboard,
} from '../services/salary-intelligence.service';
import { uploadCompanyPayslipTemplateAsset, uploadCompanyStampAsset } from './companies.controller';

/** Maps Prisma errors from create to a message the UI can show (otherwise clients only see a generic 500). */
const salaryCreateErrorMessage = (error: unknown): { status: number; message: string } | null => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        status: 409,
        message:
          'A salary structure already exists for this employee with the same effective date. Change the date or edit the existing structure.',
      };
    }
    if (error.code === 'P2003') {
      return {
        status: 400,
        message:
          'Could not save: employee user was not found. Refresh the page and select the employee again.',
      };
    }
    if (error.code === 'P2021') {
      return {
        status: 503,
        message:
          'Salary tables are missing in the database. Run `npx prisma migrate deploy` (or `migrate dev`) on this environment.',
      };
    }
  }
  return null;
};

const isHrAdmin = (role: string | undefined): boolean => {
  return role === 'ADMIN' || role === 'HR' || role === 'SUPER_ADMIN';
};

const isSelfReadOnlyRole = (role: string | undefined): boolean => {
  return role === 'MANAGER' || role === 'EMPLOYEE' || role === 'PROJECT_MANAGER';
};

const parseRequiredDate = (value: unknown): Date | null => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
};

const parseOptionalInt = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
};

const parseOptionalDecimal = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseOptionalString = (value: unknown): string | null => {
  if (value == null || value === '') return null;
  return String(value);
};

const decimalToNumber = (value: Prisma.Decimal | number | null | undefined): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const roundSalary = (value: number): number => Math.round(value * 100) / 100;

const parseNotesAsTotal = (notes: string | null | undefined): number | null => {
  if (notes == null || String(notes).trim() === '') return null;
  const n = Number(String(notes).trim());
  return Number.isFinite(n) ? n : null;
};

/** Apply increment amount to structure totals (notes, contract, basic, hourly rate). */
async function applyIncrementDeltaToStructure(
  tx: Prisma.TransactionClient,
  structureId: string,
  delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;

  const structure = await tx.salaryStructure.findUnique({
    where: { id: structureId },
    select: {
      basicSalary: true,
      contractSalaryAmount: true,
      perHourRate: true,
      notes: true,
    },
  });
  if (!structure) return;

  const basic = decimalToNumber(structure.basicSalary);
  const contract = decimalToNumber(structure.contractSalaryAmount);
  const notesTotal = parseNotesAsTotal(structure.notes);
  const currentTotal = notesTotal ?? contract ?? basic;
  const newTotal =
    currentTotal != null
      ? roundSalary(currentTotal + delta)
      : delta > 0
        ? roundSalary(delta)
        : null;

  const data: Prisma.SalaryStructureUpdateInput = {};
  if (newTotal != null) {
    data.notes = String(newTotal);
    data.perHourRate = roundSalary(newTotal / (30 * 8));
  }
  if (basic != null) data.basicSalary = roundSalary(basic + delta);
  if (contract != null) data.contractSalaryAmount = roundSalary(contract + delta);

  if (Object.keys(data).length === 0) return;

  await tx.salaryStructure.update({
    where: { id: structureId },
    data,
  });
}

const getUserOrThrow = (req: AuthRequest): { id: string; role: string } => {
  if (!req.user?.id || !req.user?.role) {
    throw new Error('Unauthorized: Missing user in request');
  }
  return { id: req.user.id, role: req.user.role };
};

const salaryStructureInclude = {
  allowances: true,
  deductions: true,
  increments: { orderBy: { effectiveDate: 'desc' as const } },
  auditLogs: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    include: {
      performedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
};

/**
 * Self view - Manager/Employee can only view their own salary configuration.
 * GET /api/salary/self
 */
export const getSelfSalaryDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isSelfReadOnlyRole(user.role) && !isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const structures = await prisma.salaryStructure.findMany({
      where: { employeeId: user.id },
      orderBy: { effectiveFrom: 'desc' },
      include: salaryStructureInclude,
    });

    const latest = structures[0] ?? null;

    res.json({
      success: true,
      data: { structures, latest },
    });
  } catch (error) {
    console.error('getSelfSalaryDetails error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch salary details' });
  }
};

/**
 * HR/Admin: list all salary structures for an employee.
 * Manager/Employee: read-only self-only (employeeId must match their user.id).
 *
 * GET /api/salary/employee/:employeeId/structures
 */
export const listEmployeeSalaryStructures = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    const { employeeId } = req.params;

    if (isSelfReadOnlyRole(user.role) && employeeId !== user.id) {
      res.status(403).json({ success: false, message: 'Access Denied: Self only' });
      return;
    }

    if (!isSelfReadOnlyRole(user.role) && !isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const structures = await prisma.salaryStructure.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: salaryStructureInclude,
    });

    res.json({
      success: true,
      data: { structures, latest: structures[0] ?? null },
    });
  } catch (error) {
    console.error('listEmployeeSalaryStructures error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch salary structures' });
  }
};

/**
 * HR/Admin: create salary structure (+ optional allowances/deductions/increments)
 *
 * POST /api/salary/employee/:employeeId/structures
 */
export const createSalaryStructure = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId } = req.params;
    const {
      effectiveFrom,
      basicSalary,
      perHourRate,
      contractSalaryAmount,
      notes,
      allowances,
      deductions,
      increments,
    } = req.body as any;

    const effectiveFromDate = parseRequiredDate(effectiveFrom);
    if (!effectiveFromDate) {
      res.status(400).json({ success: false, message: 'Invalid effectiveFrom' });
      return;
    }

    const structure = await prisma.$transaction(async (tx) => {
      const created = await tx.salaryStructure.create({
        data: {
          employeeId,
          effectiveFrom: effectiveFromDate,
          basicSalary: parseOptionalDecimal(basicSalary),
          perHourRate: parseOptionalDecimal(perHourRate),
          contractSalaryAmount: parseOptionalDecimal(contractSalaryAmount),
          notes: parseOptionalString(notes),
        },
      });

      if (Array.isArray(allowances) && allowances.length > 0) {
        await tx.salaryAllowance.createMany({
          data: allowances.map((a: any) => ({
            salaryStructureId: created.id,
            allowanceType: a.allowanceType as SalaryAllowanceType,
            amount: parseOptionalDecimal(a.amount),
            notes: parseOptionalString(a.notes),
          })),
        });
      }

      if (Array.isArray(deductions) && deductions.length > 0) {
        await tx.salaryDeduction.createMany({
          data: deductions.map((d: any) => ({
            salaryStructureId: created.id,
            deductionType: d.deductionType as SalaryDeductionType,
            mode: (d.mode as SalaryDeductionMode) ?? SalaryDeductionMode.FIXED,
            value: parseOptionalDecimal(d.value),
            notes: parseOptionalString(d.notes),
          })),
        });
      }

      if (Array.isArray(increments) && increments.length > 0) {
        await tx.salaryIncrementHistory.createMany({
          data: increments.map((i: any) => {
            const date = parseRequiredDate(i.effectiveDate);
            return {
              salaryStructureId: created.id,
              effectiveDate: date ?? new Date(), // should be validated by UI; keep non-null for DB
              incrementType: i.incrementType as SalaryIncrementType,
              amount: parseOptionalDecimal(i.amount),
              note: parseOptionalString(i.note),
            };
          }),
        });
      }

      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: created.id,
          action: SalaryAuditAction.CREATE,
          performedById: user.id,
          details: {
            employeeId,
            effectiveFrom: effectiveFromDate.toISOString(),
          },
        },
      });

      return created;
    });

    const structureWithRelations = await prisma.salaryStructure.findUnique({
      where: { id: structure.id },
      include: salaryStructureInclude,
    });

    res.json({ success: true, data: structureWithRelations });
  } catch (error) {
    console.error('createSalaryStructure error:', error);
    const mapped = salaryCreateErrorMessage(error);
    if (mapped) {
      res.status(mapped.status).json({ success: false, message: mapped.message });
      return;
    }
    const devDetail =
      process.env.NODE_ENV !== 'production' && error instanceof Error ? `: ${error.message}` : '';
    res.status(500).json({
      success: false,
      message: `Failed to create salary structure${devDetail}`,
    });
  }
};

/**
 * HR/Admin: update salary structure base fields, and optionally replace nested arrays.
 *
 * PUT /api/salary/employee/:employeeId/structures/:structureId
 */
export const updateSalaryStructure = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId } = req.params;

    const existing = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Salary structure not found' });
      return;
    }

    if (existing.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const {
      effectiveFrom,
      basicSalary,
      perHourRate,
      contractSalaryAmount,
      notes,
      allowances,
      deductions,
      increments,
    } = req.body as any;

    const effectiveFromDate = effectiveFrom != null ? parseRequiredDate(effectiveFrom) : null;
    if (effectiveFrom != null && !effectiveFromDate) {
      res.status(400).json({ success: false, message: 'Invalid effectiveFrom' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.salaryStructure.update({
        where: { id: structureId },
        data: {
          effectiveFrom: effectiveFromDate ?? undefined,
          basicSalary: basicSalary !== undefined ? parseOptionalDecimal(basicSalary) : undefined,
          perHourRate: perHourRate !== undefined ? parseOptionalDecimal(perHourRate) : undefined,
          contractSalaryAmount:
            contractSalaryAmount !== undefined ? parseOptionalDecimal(contractSalaryAmount) : undefined,
          notes: notes !== undefined ? parseOptionalString(notes) : undefined,
        },
      });

      if (Array.isArray(allowances)) {
        await tx.salaryAllowance.deleteMany({ where: { salaryStructureId: structureId } });
        if (allowances.length > 0) {
          await tx.salaryAllowance.createMany({
            data: allowances.map((a: any) => ({
              salaryStructureId: structureId,
              allowanceType: a.allowanceType as SalaryAllowanceType,
              amount: parseOptionalDecimal(a.amount),
              notes: parseOptionalString(a.notes),
            })),
          });
        }
      }

      if (Array.isArray(deductions)) {
        await tx.salaryDeduction.deleteMany({ where: { salaryStructureId: structureId } });
        if (deductions.length > 0) {
          await tx.salaryDeduction.createMany({
            data: deductions.map((d: any) => ({
              salaryStructureId: structureId,
              deductionType: d.deductionType as SalaryDeductionType,
              mode: (d.mode as SalaryDeductionMode) ?? SalaryDeductionMode.FIXED,
              value: parseOptionalDecimal(d.value),
              notes: parseOptionalString(d.notes),
            })),
          });
        }
      }

      if (Array.isArray(increments)) {
        await tx.salaryIncrementHistory.deleteMany({ where: { salaryStructureId: structureId } });
        if (increments.length > 0) {
          await tx.salaryIncrementHistory.createMany({
            data: increments.map((i: any) => {
              const date = parseRequiredDate(i.effectiveDate);
              return {
                salaryStructureId: structureId,
                effectiveDate: date ?? new Date(),
                incrementType: i.incrementType as SalaryIncrementType,
                amount: parseOptionalDecimal(i.amount),
                note: parseOptionalString(i.note),
              };
            }),
          });
        }
      }

      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.UPDATE,
          performedById: user.id,
          details: {
            employeeId,
            structureId,
            changedAt: new Date().toISOString(),
          },
        },
      });
    });

    const updated = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      include: salaryStructureInclude,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updateSalaryStructure error:', error);
    res.status(500).json({ success: false, message: 'Failed to update salary structure' });
  }
};

/**
 * HR/Admin: delete salary structure (cascade deletes nested allowances/deductions/increments).
 * DELETE /api/salary/employee/:employeeId/structures/:structureId
 */
export const deleteSalaryStructure = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId } = req.params;

    const existing = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Salary structure not found' });
      return;
    }

    if (existing.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.salaryStructure.delete({ where: { id: structureId } });
      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.DELETE,
          performedById: user.id,
          details: { employeeId, structureId },
        },
      });
    });

    res.json({ success: true, message: 'Deleted salary structure' });
  } catch (error) {
    console.error('deleteSalaryStructure error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete salary structure' });
  }
};

/**
 * HR/Admin: add allowance
 * POST /api/salary/employee/:employeeId/structures/:structureId/allowances
 */
export const addSalaryAllowance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId } = req.params;
    const { allowanceType, amount, notes } = req.body as any;

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure) {
      res.status(404).json({ success: false, message: 'Salary structure not found' });
      return;
    }
    if (structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const created = await prisma.salaryAllowance.create({
      data: {
        salaryStructureId: structureId,
        allowanceType: allowanceType as SalaryAllowanceType,
        amount: parseOptionalDecimal(amount),
        notes: parseOptionalString(notes),
      },
    });

    await prisma.salaryAuditLog.create({
      data: {
        salaryStructureId: structureId,
        action: SalaryAuditAction.ADD_ALLOWANCE,
        performedById: user.id,
        details: { allowanceId: created.id, allowanceType },
      },
    });

    res.json({ success: true, data: created });
  } catch (error) {
    console.error('addSalaryAllowance error:', error);
    res.status(500).json({ success: false, message: 'Failed to add allowance' });
  }
};

/**
 * HR/Admin: update allowance
 * PUT /api/salary/employee/:employeeId/structures/:structureId/allowances/:allowanceId
 */
export const updateSalaryAllowance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId, allowanceId } = req.params;
    const { allowanceType, amount, notes } = req.body as any;

    const allowance = await prisma.salaryAllowance.findUnique({
      where: { id: allowanceId },
      select: { salaryStructureId: true },
    });
    if (!allowance || allowance.salaryStructureId !== structureId) {
      res.status(404).json({ success: false, message: 'Allowance not found' });
      return;
    }

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure || structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const updated = await prisma.salaryAllowance.update({
      where: { id: allowanceId },
      data: {
        allowanceType: allowanceType as SalaryAllowanceType,
        amount: parseOptionalDecimal(amount),
        notes: parseOptionalString(notes),
      },
    });

    await prisma.salaryAuditLog.create({
      data: {
        salaryStructureId: structureId,
        action: SalaryAuditAction.UPDATE,
        performedById: user.id,
        details: { allowanceId: updated.id },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updateSalaryAllowance error:', error);
    res.status(500).json({ success: false, message: 'Failed to update allowance' });
  }
};

/**
 * HR/Admin: delete allowance
 * DELETE /api/salary/employee/:employeeId/structures/:structureId/allowances/:allowanceId
 */
export const deleteSalaryAllowance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId, allowanceId } = req.params;

    const allowance = await prisma.salaryAllowance.findUnique({
      where: { id: allowanceId },
      select: { salaryStructureId: true },
    });
    if (!allowance || allowance.salaryStructureId !== structureId) {
      res.status(404).json({ success: false, message: 'Allowance not found' });
      return;
    }

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure || structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.salaryAllowance.delete({ where: { id: allowanceId } });
      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.DELETE,
          performedById: user.id,
          details: { allowanceId },
        },
      });
    });

    res.json({ success: true, message: 'Deleted allowance' });
  } catch (error) {
    console.error('deleteSalaryAllowance error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete allowance' });
  }
};

/**
 * HR/Admin: add deduction
 * POST /api/salary/employee/:employeeId/structures/:structureId/deductions
 */
export const addSalaryDeduction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId } = req.params;
    const { deductionType, mode, value, notes } = req.body as any;

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure) {
      res.status(404).json({ success: false, message: 'Salary structure not found' });
      return;
    }
    if (structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const created = await prisma.salaryDeduction.create({
      data: {
        salaryStructureId: structureId,
        deductionType: deductionType as SalaryDeductionType,
        mode: (mode as SalaryDeductionMode) ?? SalaryDeductionMode.FIXED,
        value: parseOptionalDecimal(value),
        notes: parseOptionalString(notes),
      },
    });

    await prisma.salaryAuditLog.create({
      data: {
        salaryStructureId: structureId,
        action: SalaryAuditAction.ADD_DEDUCTION,
        performedById: user.id,
        details: { deductionId: created.id, deductionType },
      },
    });

    res.json({ success: true, data: created });
  } catch (error) {
    console.error('addSalaryDeduction error:', error);
    res.status(500).json({ success: false, message: 'Failed to add deduction' });
  }
};

/**
 * HR/Admin: update deduction
 * PUT /api/salary/employee/:employeeId/structures/:structureId/deductions/:deductionId
 */
export const updateSalaryDeduction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId, deductionId } = req.params;
    const { deductionType, mode, value, notes } = req.body as any;

    const deduction = await prisma.salaryDeduction.findUnique({
      where: { id: deductionId },
      select: { salaryStructureId: true },
    });
    if (!deduction || deduction.salaryStructureId !== structureId) {
      res.status(404).json({ success: false, message: 'Deduction not found' });
      return;
    }

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure || structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const updated = await prisma.salaryDeduction.update({
      where: { id: deductionId },
      data: {
        deductionType: deductionType as SalaryDeductionType,
        mode: (mode as SalaryDeductionMode) ?? SalaryDeductionMode.FIXED,
        value: parseOptionalDecimal(value),
        notes: parseOptionalString(notes),
      },
    });

    await prisma.salaryAuditLog.create({
      data: {
        salaryStructureId: structureId,
        action: SalaryAuditAction.UPDATE,
        performedById: user.id,
        details: { deductionId: updated.id },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updateSalaryDeduction error:', error);
    res.status(500).json({ success: false, message: 'Failed to update deduction' });
  }
};

/**
 * HR/Admin: delete deduction
 * DELETE /api/salary/employee/:employeeId/structures/:structureId/deductions/:deductionId
 */
export const deleteSalaryDeduction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId, deductionId } = req.params;

    const deduction = await prisma.salaryDeduction.findUnique({
      where: { id: deductionId },
      select: { salaryStructureId: true },
    });
    if (!deduction || deduction.salaryStructureId !== structureId) {
      res.status(404).json({ success: false, message: 'Deduction not found' });
      return;
    }

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure || structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.salaryDeduction.delete({ where: { id: deductionId } });
      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.DELETE,
          performedById: user.id,
          details: { deductionId },
        },
      });
    });

    res.json({ success: true, message: 'Deleted deduction' });
  } catch (error) {
    console.error('deleteSalaryDeduction error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete deduction' });
  }
};

/**
 * HR/Admin: add increment history row
 * POST /api/salary/employee/:employeeId/structures/:structureId/increments
 */
export const addSalaryIncrement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId } = req.params;
    const { effectiveDate, incrementType, amount, note } = req.body as any;

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure) {
      res.status(404).json({ success: false, message: 'Salary structure not found' });
      return;
    }
    if (structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const date = parseRequiredDate(effectiveDate);
    if (!date) {
      res.status(400).json({ success: false, message: 'Invalid effectiveDate' });
      return;
    }

    const incrementAmount = parseOptionalDecimal(amount) ?? 0;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.salaryIncrementHistory.create({
        data: {
          salaryStructureId: structureId,
          effectiveDate: date,
          incrementType: incrementType as SalaryIncrementType,
          amount: parseOptionalDecimal(amount),
          note: parseOptionalString(note),
        },
      });

      await applyIncrementDeltaToStructure(tx, structureId, incrementAmount);

      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.ADD_INCREMENT,
          performedById: user.id,
          details: {
            incrementId: row.id,
            incrementType,
            amount: incrementAmount,
            appliedToTotal: incrementAmount !== 0,
          },
        },
      });

      return row;
    });

    const refreshedStructure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      include: salaryStructureInclude,
    });

    res.json({ success: true, data: created, structure: refreshedStructure });
  } catch (error) {
    console.error('addSalaryIncrement error:', error);
    res.status(500).json({ success: false, message: 'Failed to add increment' });
  }
};

/**
 * HR/Admin: update increment history
 * PUT /api/salary/employee/:employeeId/structures/:structureId/increments/:incrementId
 */
export const updateSalaryIncrement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId, incrementId } = req.params;
    const { effectiveDate, incrementType, amount, note } = req.body as any;

    const increment = await prisma.salaryIncrementHistory.findUnique({
      where: { id: incrementId },
      select: { salaryStructureId: true, amount: true },
    });
    if (!increment || increment.salaryStructureId !== structureId) {
      res.status(404).json({ success: false, message: 'Increment not found' });
      return;
    }

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure || structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const date = effectiveDate != null ? parseRequiredDate(effectiveDate) : null;
    if (effectiveDate != null && !date) {
      res.status(400).json({ success: false, message: 'Invalid effectiveDate' });
      return;
    }

    const previousAmount = decimalToNumber(increment.amount) ?? 0;
    const nextAmount = amount !== undefined ? parseOptionalDecimal(amount) ?? 0 : previousAmount;
    const delta = roundSalary(nextAmount - previousAmount);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.salaryIncrementHistory.update({
        where: { id: incrementId },
        data: {
          effectiveDate: date ?? undefined,
          incrementType: incrementType as SalaryIncrementType,
          amount: amount !== undefined ? parseOptionalDecimal(amount) : undefined,
          note: note !== undefined ? parseOptionalString(note) : undefined,
        },
      });

      await applyIncrementDeltaToStructure(tx, structureId, delta);

      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.UPDATE,
          performedById: user.id,
          details: {
            incrementId: row.id,
            previousAmount,
            newAmount: nextAmount,
            delta,
          },
        },
      });

      return row;
    });

    const refreshedStructure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      include: salaryStructureInclude,
    });

    res.json({ success: true, data: updated, structure: refreshedStructure });
  } catch (error) {
    console.error('updateSalaryIncrement error:', error);
    res.status(500).json({ success: false, message: 'Failed to update increment' });
  }
};

/**
 * HR/Admin: delete increment history
 * DELETE /api/salary/employee/:employeeId/structures/:structureId/increments/:incrementId
 */
export const deleteSalaryIncrement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied: HR/Admin only' });
      return;
    }

    const { employeeId, structureId, incrementId } = req.params;

    const increment = await prisma.salaryIncrementHistory.findUnique({
      where: { id: incrementId },
      select: { salaryStructureId: true, amount: true },
    });
    if (!increment || increment.salaryStructureId !== structureId) {
      res.status(404).json({ success: false, message: 'Increment not found' });
      return;
    }

    const structure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      select: { employeeId: true },
    });
    if (!structure || structure.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Salary structure does not belong to employee' });
      return;
    }

    const removedAmount = decimalToNumber(increment.amount) ?? 0;

    await prisma.$transaction(async (tx) => {
      await applyIncrementDeltaToStructure(tx, structureId, -removedAmount);
      await tx.salaryIncrementHistory.delete({ where: { id: incrementId } });
      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.DELETE,
          performedById: user.id,
          details: { incrementId, removedAmount, reversedFromTotal: removedAmount !== 0 },
        },
      });
    });

    const refreshedStructure = await prisma.salaryStructure.findUnique({
      where: { id: structureId },
      include: salaryStructureInclude,
    });

    res.json({ success: true, message: 'Deleted increment', structure: refreshedStructure });
  } catch (error) {
    console.error('deleteSalaryIncrement error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete increment' });
  }
};

export const getMonthlySalarySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(String(req.query.year || ''), 10);
    const month = parseInt(String(req.query.month || ''), 10);
    const companyId = typeof req.query.companyId === 'string' && req.query.companyId.trim()
      ? req.query.companyId.trim()
      : undefined;

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ success: false, message: 'Invalid month' });
      return;
    }

    const sheet = await getMonthlySalarySheetService({ year, month, companyId });
    res.json({ success: true, data: sheet });
  } catch (error) {
    console.error('getMonthlySalarySheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to load monthly salary sheet' });
  }
};

export const saveMonthlySalarySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    const year = parseInt(String(req.body?.year ?? ''), 10);
    const month = parseInt(String(req.body?.month ?? ''), 10);
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ success: false, message: 'Invalid month' });
      return;
    }

    const normalized = entries
      .map((e: Record<string, unknown>) => ({
        employeeId: String(e.employeeId || ''),
        worksheetData:
          e.worksheetData != null && typeof e.worksheetData === 'object' && !Array.isArray(e.worksheetData)
            ? (e.worksheetData as Record<string, unknown>)
            : null,
        totalSalary: parseOptionalDecimal(e.totalSalary),
        realWorkingDays: parseOptionalInt(e.realWorkingDays),
        unexcusedAbsenceDays: parseOptionalInt(e.unexcusedAbsenceDays),
        lateHours: parseOptionalDecimal(e.lateHours),
        normalOtHours: parseOptionalDecimal(e.normalOtHours),
        specialOtHours: parseOptionalDecimal(e.specialOtHours),
        otherDeductions: parseOptionalDecimal(e.otherDeductions),
        adjustments: parseOptionalDecimal(e.adjustments),
        otherExpenses: parseOptionalDecimal(e.otherExpenses),
        paidSalary: parseOptionalDecimal(e.paidSalary),
        adminComments: parseOptionalString(e.adminComments),
        hrComments: parseOptionalString(e.hrComments),
        notes: parseOptionalString(e.notes),
      }))
      .filter((e: { employeeId: string }) => e.employeeId);

    const result = await saveMonthlySalarySheetService({
      year,
      month,
      entries: normalized,
      updatedById: user.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('saveMonthlySalarySheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to save monthly salary sheet' });
  }
};

export const runPayrollFromMonthlySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    const year = parseInt(String(req.body?.year ?? ''), 10);
    const month = parseInt(String(req.body?.month ?? ''), 10);
    const companyId =
      typeof req.body?.companyId === 'string' && req.body.companyId.trim()
        ? req.body.companyId.trim()
        : undefined;

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ success: false, message: 'Invalid month' });
      return;
    }

    const result = await createPayrollRunFromMonthlySheetService({
      year,
      month,
      companyId,
      userId: user.id,
    });

    res.json({
      success: true,
      data: {
        payrollRunId: result.run?.id,
        run: result.run,
        created: result.created,
        refreshed: result.refreshed,
      },
    });
  } catch (error) {
    console.error('runPayrollFromMonthlySheet error:', error);
    const code = (error as Error & { code?: string })?.code;
    const message = error instanceof Error ? error.message : 'Failed to create payroll run from sheet';
    const status =
      code === 'NO_PAYROLL_DATA' ? 400 : code === 'PAYROLL_LOCKED' ? 409 : 500;
    res.status(status).json({ success: false, message, code });
  }
};

export const publishMonthlySalarySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    const year = parseInt(String(req.body?.year ?? ''), 10);
    const month = parseInt(String(req.body?.month ?? ''), 10);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ success: false, message: 'Invalid month' });
      return;
    }

    const result = await publishMonthlySalaryToEmployeesService({
      year,
      month,
      publishedById: user.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('publishMonthlySalarySheet error:', error);
    const code = (error as Error & { code?: string })?.code;
    const message = error instanceof Error ? error.message : 'Failed to publish payslips';
    const status = code === 'NO_PUBLISH_DATA' ? 400 : 500;
    res.status(status).json({ success: false, message, code });
  }
};

export const unpublishMonthlySalarySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    getUserOrThrow(req);
    const year = parseInt(String(req.body?.year ?? ''), 10);
    const month = parseInt(String(req.body?.month ?? ''), 10);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year' });
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ success: false, message: 'Invalid month' });
      return;
    }

    const result = await unpublishMonthlySalaryForPeriodService(year, month);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('unpublishMonthlySalarySheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to unpublish payslips' });
  }
};

export const getSelfPublishedPayslips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isSelfReadOnlyRole(user.role) && !isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const payslips = await getEmployeePublishedPayslipsService(user.id);
    res.json({ success: true, data: { payslips } });
  } catch (error) {
    console.error('getSelfPublishedPayslips error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payslips' });
  }
};

export const getSelfPublishedPayslipDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isSelfReadOnlyRole(user.role) && !isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const year = parseInt(String(req.params.year ?? ''), 10);
    const month = parseInt(String(req.params.month ?? ''), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      res.status(400).json({ success: false, message: 'Invalid period' });
      return;
    }

    const payslip = await getEmployeePublishedPayslipDetailService(user.id, year, month);
    if (!payslip) {
      res.status(404).json({ success: false, message: 'No published payslip for this period' });
      return;
    }

    res.json({ success: true, data: { payslip } });
  } catch (error) {
    console.error('getSelfPublishedPayslipDetail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payslip' });
  }
};

export const createSelfPayslipRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isSelfReadOnlyRole(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const year = parseInt(String(req.body?.year ?? ''), 10);
    const month = parseInt(String(req.body?.month ?? ''), 10);
    const message = typeof req.body?.message === 'string' ? req.body.message : '';

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      res.status(400).json({ success: false, message: 'Invalid period' });
      return;
    }

    const request = await createSalaryPayslipRequestService({
      employeeId: user.id,
      year,
      month,
      message,
    });

    res.status(201).json({ success: true, data: { request } });
  } catch (error) {
    console.error('createSelfPayslipRequest error:', error);
    const code = (error as Error & { code?: string })?.code;
    const message = error instanceof Error ? error.message : 'Failed to submit request';
    const status =
      code === 'VALIDATION' || code === 'DUPLICATE' ? 400 : code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ success: false, message, code });
  }
};

export const listPayslipRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const year = req.query.year != null ? parseInt(String(req.query.year), 10) : undefined;
    const month = req.query.month != null ? parseInt(String(req.query.month), 10) : undefined;
    const statusRaw = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const status =
      statusRaw === 'OPEN' || statusRaw === 'RESOLVED' || statusRaw === 'REJECTED'
        ? statusRaw
        : undefined;

    const requests = await listSalaryPayslipRequestsService({ year, month, status });
    res.json({ success: true, data: { requests } });
  } catch (error) {
    console.error('listPayslipRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to list payslip requests' });
  }
};

export const respondToPayslipRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = getUserOrThrow(req);
    if (!isHrAdmin(user.role)) {
      res.status(403).json({ success: false, message: 'Access Denied' });
      return;
    }

    const { requestId } = req.params;
    const statusRaw = typeof req.body?.status === 'string' ? req.body.status.toUpperCase() : '';
    const hrResponse = typeof req.body?.hrResponse === 'string' ? req.body.hrResponse : '';

    if (statusRaw !== 'RESOLVED' && statusRaw !== 'REJECTED') {
      res.status(400).json({ success: false, message: 'status must be RESOLVED or REJECTED' });
      return;
    }

    const request = await respondToSalaryPayslipRequestService({
      requestId,
      status: statusRaw,
      hrResponse,
      respondedById: user.id,
    });

    res.json({ success: true, data: { request } });
  } catch (error) {
    console.error('respondToPayslipRequest error:', error);
    const code = (error as Error & { code?: string })?.code;
    const message = error instanceof Error ? error.message : 'Failed to respond to request';
    const status = code === 'VALIDATION' ? 400 : code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ success: false, message, code });
  }
};

/** GET payslip template path for a company (HR). */
export const getPayslipTemplateForCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    getUserOrThrow(req);
    const { companyId } = req.params;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, payslipTemplate: true } as Prisma.CompanySelect,
    });
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }
    res.json({ success: true, data: company });
  } catch (error) {
    console.error('getPayslipTemplateForCompany error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payslip template' });
  }
};

/** POST payslip template for a company (HR — Salary page). */
export const uploadPayslipTemplateForCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  req.params.id = req.params.companyId;
  return uploadCompanyPayslipTemplateAsset(req, res);
};

/** GET company seal for a company (HR). */
export const getCompanyStampForCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    getUserOrThrow(req);
    const { companyId } = req.params;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, stamp: true } as Prisma.CompanySelect,
    });
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }
    res.json({ success: true, data: company });
  } catch (error) {
    console.error('getCompanyStampForCompany error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch company seal' });
  }
};

/** POST company seal for a company (HR — Salary page). */
export const uploadCompanyStampForCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  req.params.id = req.params.companyId;
  return uploadCompanyStampAsset(req, res);
};

/** GET salary intelligence dashboard (executive / HR / finance / PM scoped). */
export const getSalaryIntelligenceDashboardHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const authUser = getUserOrThrow(req);
    if (!canViewSalaryIntelligence(authUser.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const viewer = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, role: true, department: true },
    });
    if (!viewer) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const year = parseOptionalInt(req.query.year) ?? undefined;
    const month = parseOptionalInt(req.query.month) ?? undefined;
    const companyId = parseOptionalString(req.query.companyId) ?? undefined;

    const data = await getSalaryIntelligenceDashboard(viewer, { year, month, companyId });
    res.json({ success: true, data });
  } catch (error) {
    console.error('getSalaryIntelligenceDashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load salary intelligence dashboard' });
  }
};

/** GET employee drill-down for salary intelligence. */
export const getEmployeeSalaryIntelligenceHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const authUser = getUserOrThrow(req);
    if (!canViewSalaryIntelligence(authUser.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const viewer = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, role: true, department: true },
    });
    if (!viewer) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { employeeId } = req.params;
    const year = parseOptionalInt(req.query.year) ?? undefined;
    const month = parseOptionalInt(req.query.month) ?? undefined;
    const companyId = parseOptionalString(req.query.companyId) ?? undefined;

    const data = await getEmployeeSalaryIntelligenceDetail(viewer, employeeId, {
      year,
      month,
      companyId,
    });
    if (!data) {
      res.status(404).json({ success: false, message: 'Employee not found or not in your scope' });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('getEmployeeSalaryIntelligence error:', error);
    res.status(500).json({ success: false, message: 'Failed to load employee salary intelligence' });
  }
};
