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
  return role === 'ADMIN' || role === 'HR';
};

const isSelfReadOnlyRole = (role: string | undefined): boolean => {
  return role === 'MANAGER' || role === 'EMPLOYEE' || role === 'PROJECT_MANAGER';
};

const parseRequiredDate = (value: unknown): Date | null => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
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

const getUserOrThrow = (req: AuthRequest): { id: string; role: string } => {
  if (!req.user?.id || !req.user?.role) {
    throw new Error('Unauthorized: Missing user in request');
  }
  return { id: req.user.id, role: req.user.role };
};

const salaryStructureInclude = {
  allowances: true,
  deductions: true,
  increments: true,
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

    const created = await prisma.salaryIncrementHistory.create({
      data: {
        salaryStructureId: structureId,
        effectiveDate: date,
        incrementType: incrementType as SalaryIncrementType,
        amount: parseOptionalDecimal(amount),
        note: parseOptionalString(note),
      },
    });

    await prisma.salaryAuditLog.create({
      data: {
        salaryStructureId: structureId,
        action: SalaryAuditAction.ADD_INCREMENT,
        performedById: user.id,
        details: { incrementId: created.id, incrementType },
      },
    });

    res.json({ success: true, data: created });
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
      select: { salaryStructureId: true },
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

    const updated = await prisma.salaryIncrementHistory.update({
      where: { id: incrementId },
      data: {
        effectiveDate: date ?? undefined,
        incrementType: incrementType as SalaryIncrementType,
        amount: parseOptionalDecimal(amount),
        note: parseOptionalString(note),
      },
    });

    await prisma.salaryAuditLog.create({
      data: {
        salaryStructureId: structureId,
        action: SalaryAuditAction.UPDATE,
        performedById: user.id,
        details: { incrementId: updated.id },
      },
    });

    res.json({ success: true, data: updated });
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
      select: { salaryStructureId: true },
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

    await prisma.$transaction(async (tx) => {
      await tx.salaryIncrementHistory.delete({ where: { id: incrementId } });
      await tx.salaryAuditLog.create({
        data: {
          salaryStructureId: structureId,
          action: SalaryAuditAction.DELETE,
          performedById: user.id,
          details: { incrementId },
        },
      });
    });

    res.json({ success: true, message: 'Deleted increment' });
  } catch (error) {
    console.error('deleteSalaryIncrement error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete increment' });
  }
};

