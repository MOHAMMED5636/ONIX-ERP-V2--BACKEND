import {
  AttendanceStatus,
  AttendanceType,
  PayrollStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import prisma from '../config/database';
import { buildCompanyScopedUserFilter } from '../utils/attendance-manual-entry';
import { resolvePayrollLineCompanyNames } from './payroll-company.service';
import { dateFromYyyyMmDd } from '../utils/attendance-admin-rows';
import { lateCutoffOnDay, officeStartOnDay } from '../utils/attendance-status.util';
import { DEFAULT_SETTINGS } from './payrollCalculation.service';
import { emitErpNotification } from './erpNotification.service';
import { notifySalaryCreditedEmail, notifyPayslipRequestEmail } from './emailDispatch.service';

export const SHEET_WORKING_DAYS = 30;
export const SHEET_DAILY_HOURS = 8;
export const NORMAL_OT_RATE = 1.0;
export const SPECIAL_OT_RATE = 1.5;

/** Payroll sheet rows — separate from attendance-exempt roles (HR/Admin may still receive salary). */
const SALARY_SHEET_EXCLUDED_ROLES: UserRole[] = [UserRole.TENDER_ENGINEER, UserRole.CONTRACTOR];

const WORKED_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EARLY_DEPARTURE,
  AttendanceStatus.OUT_OF_LOCATION,
]);

export type MonthlySheetManualFields = {
  worksheetData: Record<string, unknown> | null;
  totalSalary: number | null;
  realWorkingDays: number | null;
  unexcusedAbsenceDays: number | null;
  lateHours: number | null;
  normalOtHours: number | null;
  specialOtHours: number | null;
  otherDeductions: number | null;
  adjustments: number | null;
  otherExpenses: number | null;
  paidSalary: number | null;
  adminComments: string | null;
  hrComments: string | null;
  notes: string | null;
};

export type MonthlySheetRow = {
  rowIndex: number;
  employeeUserId: string;
  employeeNo: string;
  personName: string;
  jobName: string;
  visaExpiry: string | null;
  joiningDate: string | null;
  joiningMonthDuration: number;
  totalSalary: number | null;
  hasSalaryStructure: boolean;
  workingDays: number;
  salaryPerDay: number | null;
  salaryPerHour: number | null;
  dailyWorkingHours: number;
  realWorkingDays: number;
  salaryOfWorkingDays: number | null;
  normalOtHours: number | null;
  normalOtRate: number;
  normalOtPay: number | null;
  specialOtHours: number | null;
  specialOtRate: number;
  specialOtPay: number | null;
  unexcusedAbsenceDays: number;
  absenceDeduction: number | null;
  lateHours: number;
  lateDeduction: number | null;
  otherDeductions: number | null;
  adjustments: number | null;
  otherExpenses: number | null;
  finalSalary: number | null;
  paidSalary: number | null;
  adminComments: string | null;
  hrComments: string | null;
  notes: string | null;
};

export type MonthlySheetTotals = {
  totalSalary: number;
  salaryOfWorkingDays: number;
  normalOtPay: number;
  specialOtPay: number;
  absenceDeduction: number;
  lateDeduction: number;
  otherDeductions: number;
  adjustments: number;
  otherExpenses: number;
  finalSalary: number;
  paidSalary: number;
};

export type MonthlySheetResult = {
  year: number;
  month: number;
  companyId: string | null;
  periodStart: string;
  periodEnd: string;
  rows: MonthlySheetRow[];
  totals: MonthlySheetTotals;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDateYmd(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getJoiningMonthDuration(joiningDate: Date | null, year: number, month: number): number {
  const total = daysInMonth(year, month);
  if (!joiningDate) return total;
  const jy = joiningDate.getUTCFullYear();
  const jm = joiningDate.getUTCMonth() + 1;
  const jd = joiningDate.getUTCDate();
  if (jy !== year || jm !== month) return total;
  return total - jd + 1;
}

function monthPeriodBounds(year: number, month: number): { start: Date; end: Date; startYmd: string; endYmd: string } {
  const startYmd = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = daysInMonth(year, month);
  const endYmd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    start: dateFromYyyyMmDd(startYmd),
    end: dateFromYyyyMmDd(endYmd),
    startYmd,
    endYmd,
  };
}

function computeLateMinutes(checkIn: Date | null, dateYmd: string): number {
  if (!checkIn) return 0;
  const officeStart = officeStartOnDay(dateYmd);
  const lateCutoff = lateCutoffOnDay(dateYmd);
  if (!officeStart || !lateCutoff) return 0;
  if (checkIn.getTime() <= lateCutoff.getTime()) return 0;
  return Math.round((checkIn.getTime() - officeStart.getTime()) / 60000);
}

function computeRowAmounts(params: {
  totalSalary: number | null;
  realWorkingDays: number;
  absentDays: number;
  lateMinutes: number;
  manual: MonthlySheetManualFields;
  lateDeductionPerMinute: number;
}): Pick<
  MonthlySheetRow,
  | 'salaryPerDay'
  | 'salaryPerHour'
  | 'salaryOfWorkingDays'
  | 'normalOtPay'
  | 'specialOtPay'
  | 'absenceDeduction'
  | 'lateDeduction'
  | 'finalSalary'
  | 'paidSalary'
> {
  const { totalSalary, realWorkingDays, absentDays, lateMinutes, manual, lateDeductionPerMinute } =
    params;

  if (totalSalary == null || totalSalary <= 0) {
    return {
      salaryPerDay: null,
      salaryPerHour: null,
      salaryOfWorkingDays: null,
      normalOtPay: null,
      specialOtPay: null,
      absenceDeduction: null,
      lateDeduction: null,
      finalSalary: null,
      paidSalary: manual.paidSalary,
    };
  }

  const salaryPerDay = totalSalary / SHEET_WORKING_DAYS;
  const salaryPerHour = salaryPerDay / SHEET_DAILY_HOURS;
  const salaryOfWorkingDays = round2(salaryPerDay * realWorkingDays);

  const normalOtHours = manual.normalOtHours ?? 0;
  const specialOtHours = manual.specialOtHours ?? 0;
  const normalOtPay = round2(normalOtHours * salaryPerHour * NORMAL_OT_RATE);
  const specialOtPay = round2(specialOtHours * salaryPerHour * SPECIAL_OT_RATE);

  const absenceDeduction = round2(absentDays * salaryPerDay);
  const lateDeduction = round2(lateDeductionPerMinute * lateMinutes);

  const otherDeductions = manual.otherDeductions ?? 0;
  const adjustments = manual.adjustments ?? 0;
  const otherExpenses = manual.otherExpenses ?? 0;

  const finalSalary = round2(
    salaryOfWorkingDays +
      normalOtPay +
      specialOtPay -
      absenceDeduction -
      lateDeduction -
      otherDeductions +
      adjustments +
      otherExpenses,
  );

  const paidSalary = manual.paidSalary != null ? round2(manual.paidSalary) : finalSalary;

  return {
    salaryPerDay: round2(salaryPerDay),
    salaryPerHour: round2(salaryPerHour),
    salaryOfWorkingDays,
    normalOtPay,
    specialOtPay,
    absenceDeduction,
    lateDeduction,
    finalSalary,
    paidSalary,
  };
}

async function fetchSheetEmployees(companyId?: string) {
  const andParts: Prisma.UserWhereInput[] = [
    { isActive: true },
    {
      role: {
        notIn: SALARY_SHEET_EXCLUDED_ROLES,
      },
    },
    { employeeId: { not: null } },
    { NOT: { employeeId: { equals: '' } } },
  ];

  if (companyId) {
    const companyFilter = await buildCompanyScopedUserFilter(companyId);
    if (companyFilter) andParts.push(companyFilter);
  }

  return prisma.user.findMany({
    where: { AND: andParts },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      position: true,
      joiningDate: true,
      residencyExpiryDate: true,
      passportExpiryDate: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { employeeId: 'asc' }],
  });
}

type DayAttendance = {
  status: AttendanceStatus | null;
  checkIn: Date | null;
};

async function fetchAttendanceByUser(
  userIds: string[],
  startYmd: string,
  endYmd: string,
): Promise<Map<string, Map<string, DayAttendance>>> {
  const result = new Map<string, Map<string, DayAttendance>>();
  if (!userIds.length) return result;

  const start = dateFromYyyyMmDd(startYmd);
  const end = dateFromYyyyMmDd(endYmd);

  const records = await prisma.attendance.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: start, lte: end },
    },
    select: {
      userId: true,
      date: true,
      type: true,
      status: true,
      checkInTime: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const rec of records) {
    const ymd = formatDateYmd(rec.date);
    if (!ymd) continue;
    if (!result.has(rec.userId)) result.set(rec.userId, new Map());
    const byDay = result.get(rec.userId)!;
    const existing = byDay.get(ymd) ?? { status: null, checkIn: null };

    if (rec.type === AttendanceType.CHECK_IN) {
      existing.status = rec.status ?? existing.status;
      existing.checkIn = rec.checkInTime ?? existing.checkIn;
    } else if (!existing.status) {
      existing.status = rec.status;
    }

    byDay.set(ymd, existing);
  }

  return result;
}

function rollupAttendance(byDay: Map<string, DayAttendance> | undefined): {
  realWorkingDays: number;
  absentDays: number;
  lateMinutes: number;
} {
  let realWorkingDays = 0;
  let absentDays = 0;
  let lateMinutes = 0;

  if (!byDay) return { realWorkingDays, absentDays, lateMinutes };

  for (const [ymd, day] of byDay.entries()) {
    const status = day.status;
    if (!status) continue;

    if (WORKED_STATUSES.has(status)) {
      realWorkingDays += 1;
    }
    if (status === AttendanceStatus.ABSENT) {
      absentDays += 1;
    }
    if (status === AttendanceStatus.LATE) {
      lateMinutes += computeLateMinutes(day.checkIn, ymd);
    } else if (day.checkIn) {
      const mins = computeLateMinutes(day.checkIn, ymd);
      if (mins > 0) lateMinutes += mins;
    }
  }

  return { realWorkingDays, absentDays, lateMinutes };
}

async function fetchLatestStructures(
  employeeIds: string[],
  monthEnd: Date,
): Promise<Map<string, { contractSalaryAmount: number | null; basicSalary: number | null }>> {
  const map = new Map<string, { contractSalaryAmount: number | null; basicSalary: number | null }>();
  if (!employeeIds.length) return map;

  const structures = await prisma.salaryStructure.findMany({
    where: {
      employeeId: { in: employeeIds },
      effectiveFrom: { lte: monthEnd },
    },
    orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
    select: {
      employeeId: true,
      contractSalaryAmount: true,
      basicSalary: true,
      effectiveFrom: true,
    },
  });

  for (const s of structures) {
    if (map.has(s.employeeId)) continue;
    map.set(s.employeeId, {
      contractSalaryAmount: toNum(s.contractSalaryAmount),
      basicSalary: toNum(s.basicSalary),
    });
  }

  return map;
}

async function fetchManualLines(
  year: number,
  month: number,
  employeeIds: string[],
): Promise<Map<string, MonthlySheetManualFields>> {
  const map = new Map<string, MonthlySheetManualFields>();
  if (!employeeIds.length) return map;

  const lines = await prisma.salaryMonthlyLine.findMany({
    where: { year, month, employeeId: { in: employeeIds } },
  });

  for (const line of lines) {
    const row = line as typeof line & { worksheetData?: Prisma.JsonValue | null; adminComments?: string | null; hrComments?: string | null };
    const worksheetData =
      row.worksheetData != null &&
      typeof row.worksheetData === 'object' &&
      !Array.isArray(row.worksheetData)
        ? (row.worksheetData as Record<string, unknown>)
        : null;

    map.set(line.employeeId, {
      worksheetData,
      totalSalary: toNum(line.totalSalary),
      realWorkingDays: line.realWorkingDays ?? null,
      unexcusedAbsenceDays: line.unexcusedAbsenceDays ?? null,
      lateHours: toNum(line.lateHours),
      normalOtHours: toNum(line.normalOtHours),
      specialOtHours: toNum(line.specialOtHours),
      otherDeductions: toNum(line.otherDeductions),
      adjustments: toNum(line.adjustments),
      otherExpenses: toNum(line.otherExpenses),
      paidSalary: toNum(line.paidSalary),
      adminComments: row.adminComments ?? null,
      hrComments: row.hrComments ?? null,
      notes: line.notes,
    });
  }

  return map;
}

function emptyManual(): MonthlySheetManualFields {
  return {
    worksheetData: null,
    totalSalary: null,
    realWorkingDays: null,
    unexcusedAbsenceDays: null,
    lateHours: null,
    normalOtHours: null,
    specialOtHours: null,
    otherDeductions: null,
    adjustments: null,
    otherExpenses: null,
    paidSalary: null,
    adminComments: null,
    hrComments: null,
    notes: null,
  };
}

function mergeWorksheetData(base: MonthlySheetRow, data: Record<string, unknown>): MonthlySheetRow {
  const merged = { ...base };
  for (const [key, val] of Object.entries(data)) {
    if (key === 'rowIndex' || key === 'employeeUserId' || key === 'hasSalaryStructure') continue;
    if (key in merged) {
      (merged as Record<string, unknown>)[key] = val;
    }
  }
  const total = merged.totalSalary;
  merged.hasSalaryStructure = total != null && Number(total) > 0;
  return merged;
}

function sumTotals(rows: MonthlySheetRow[]): MonthlySheetTotals {
  const sum = (pick: (r: MonthlySheetRow) => number | null) =>
    round2(rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0));

  return {
    totalSalary: sum((r) => r.totalSalary),
    salaryOfWorkingDays: sum((r) => r.salaryOfWorkingDays),
    normalOtPay: sum((r) => r.normalOtPay),
    specialOtPay: sum((r) => r.specialOtPay),
    absenceDeduction: sum((r) => r.absenceDeduction),
    lateDeduction: sum((r) => r.lateDeduction),
    otherDeductions: sum((r) => r.otherDeductions),
    adjustments: sum((r) => r.adjustments),
    otherExpenses: sum((r) => r.otherExpenses),
    finalSalary: sum((r) => r.finalSalary),
    paidSalary: sum((r) => r.paidSalary),
  };
}

export async function getMonthlySalarySheet(params: {
  year: number;
  month: number;
  companyId?: string;
}): Promise<MonthlySheetResult> {
  const { year, month, companyId } = params;
  const { start, end, startYmd, endYmd } = monthPeriodBounds(year, month);

  const settingsRow = await prisma.payrollSettings.findFirst({ orderBy: { createdAt: 'desc' } });
  const lateDeductionPerMinute =
    settingsRow?.lateDeductionPerMinute != null
      ? Number(settingsRow.lateDeductionPerMinute)
      : DEFAULT_SETTINGS.lateDeductionPerMinute;

  const employees = await fetchSheetEmployees(companyId);
  const userIds = employees.map((e) => e.id);

  const [attendanceByUser, structures, manualLines] = await Promise.all([
    fetchAttendanceByUser(userIds, startYmd, endYmd),
    fetchLatestStructures(userIds, end),
    fetchManualLines(year, month, userIds),
  ]);

  const rows: MonthlySheetRow[] = employees.map((emp, idx) => {
    const structure = structures.get(emp.id);
    const contract = structure?.contractSalaryAmount;
    const basic = structure?.basicSalary;
    const structureSalary: number | null = contract != null ? contract : basic ?? null;

    const visaDate = emp.residencyExpiryDate ?? emp.passportExpiryDate;
    const manual = manualLines.get(emp.id) ?? emptyManual();
    const att = rollupAttendance(attendanceByUser.get(emp.id));

    const totalSalary = manual.totalSalary ?? structureSalary;
    const realWorkingDays = manual.realWorkingDays ?? att.realWorkingDays;
    const absentDays = manual.unexcusedAbsenceDays ?? att.absentDays;
    const lateHours =
      manual.lateHours != null ? manual.lateHours : round2(att.lateMinutes / 60);
    const lateMinutes = Math.round(lateHours * 60);
    const hasSalaryStructure = totalSalary != null && totalSalary > 0;

    const amounts = computeRowAmounts({
      totalSalary,
      realWorkingDays,
      absentDays,
      lateMinutes,
      manual,
      lateDeductionPerMinute,
    });

    let row: MonthlySheetRow = {
      rowIndex: idx + 1,
      employeeUserId: emp.id,
      employeeNo: emp.employeeId || '',
      personName: `${emp.firstName} ${emp.lastName}`.trim(),
      jobName: emp.jobTitle || emp.position || '',
      visaExpiry: formatDateYmd(visaDate),
      joiningDate: formatDateYmd(emp.joiningDate),
      joiningMonthDuration: getJoiningMonthDuration(emp.joiningDate, year, month),
      totalSalary,
      hasSalaryStructure,
      workingDays: SHEET_WORKING_DAYS,
      dailyWorkingHours: SHEET_DAILY_HOURS,
      realWorkingDays,
      normalOtHours: manual.normalOtHours,
      normalOtRate: NORMAL_OT_RATE,
      specialOtHours: manual.specialOtHours,
      specialOtRate: SPECIAL_OT_RATE,
      unexcusedAbsenceDays: absentDays,
      lateHours,
      otherDeductions: manual.otherDeductions,
      adjustments: manual.adjustments,
      otherExpenses: manual.otherExpenses,
      adminComments: manual.adminComments,
      hrComments: manual.hrComments,
      notes: manual.notes,
      ...amounts,
    };

    if (manual.worksheetData) {
      row = mergeWorksheetData(row, manual.worksheetData);
    }

    return row;
  });

  rows.sort((a, b) =>
    (a.personName || '').localeCompare(b.personName || '', undefined, { sensitivity: 'base' }),
  );
  rows.forEach((row, idx) => {
    row.rowIndex = idx + 1;
  });

  return {
    year,
    month,
    companyId: companyId ?? null,
    periodStart: startYmd,
    periodEnd: endYmd,
    rows,
    totals: sumTotals(rows),
  };
}

export type MonthlySheetSaveEntry = {
  employeeId: string;
  worksheetData?: Record<string, unknown> | null;
  totalSalary?: number | null;
  realWorkingDays?: number | null;
  unexcusedAbsenceDays?: number | null;
  lateHours?: number | null;
  normalOtHours?: number | null;
  specialOtHours?: number | null;
  otherDeductions?: number | null;
  adjustments?: number | null;
  otherExpenses?: number | null;
  paidSalary?: number | null;
  adminComments?: string | null;
  hrComments?: string | null;
  notes?: string | null;
};

function hasWorksheetContent(entry: MonthlySheetSaveEntry): boolean {
  if (entry.worksheetData && Object.keys(entry.worksheetData).length > 0) return true;
  return (
    entry.totalSalary != null ||
    entry.realWorkingDays != null ||
    entry.unexcusedAbsenceDays != null ||
    entry.lateHours != null ||
    entry.normalOtHours != null ||
    entry.specialOtHours != null ||
    entry.otherDeductions != null ||
    entry.adjustments != null ||
    entry.otherExpenses != null ||
    entry.paidSalary != null ||
    (entry.adminComments != null && entry.adminComments.trim() !== '') ||
    (entry.hrComments != null && entry.hrComments.trim() !== '') ||
    (entry.notes != null && entry.notes.trim() !== '')
  );
}

export async function saveMonthlySalarySheet(params: {
  year: number;
  month: number;
  entries: MonthlySheetSaveEntry[];
  updatedById: string;
}): Promise<{ saved: number }> {
  const { year, month, entries, updatedById } = params;
  let saved = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      if (!entry.employeeId) continue;

      const worksheetJson =
        entry.worksheetData != null
          ? (entry.worksheetData as Prisma.InputJsonValue)
          : undefined;

      const data = {
        worksheetData: worksheetJson,
        totalSalary: entry.totalSalary ?? null,
        realWorkingDays: entry.realWorkingDays ?? null,
        unexcusedAbsenceDays: entry.unexcusedAbsenceDays ?? null,
        lateHours: entry.lateHours ?? null,
        normalOtHours: entry.normalOtHours ?? null,
        specialOtHours: entry.specialOtHours ?? null,
        otherDeductions: entry.otherDeductions ?? null,
        adjustments: entry.adjustments ?? null,
        otherExpenses: entry.otherExpenses ?? null,
        paidSalary: entry.paidSalary ?? null,
        adminComments: entry.adminComments ?? null,
        hrComments: entry.hrComments ?? null,
        notes: entry.notes ?? null,
        updatedById,
      };

      if (!hasWorksheetContent(entry)) {
        await tx.salaryMonthlyLine.deleteMany({
          where: { year, month, employeeId: entry.employeeId },
        });
        continue;
      }

      await tx.salaryMonthlyLine.upsert({
        where: {
          year_month_employeeId: {
            year,
            month,
            employeeId: entry.employeeId,
          },
        },
        create: {
          year,
          month,
          employeeId: entry.employeeId,
          ...data,
        },
        update: data,
      });
      saved += 1;
    }
  });

  return { saved };
}

/** Client-side recalculation helper (same formulas as backend). */
export function recalculateSheetRow(
  row: Pick<
    MonthlySheetRow,
    | 'totalSalary'
    | 'realWorkingDays'
    | 'unexcusedAbsenceDays'
    | 'lateHours'
    | 'normalOtHours'
    | 'specialOtHours'
    | 'otherDeductions'
    | 'adjustments'
    | 'otherExpenses'
    | 'paidSalary'
  >,
  lateDeductionPerMinute = DEFAULT_SETTINGS.lateDeductionPerMinute,
): Pick<
  MonthlySheetRow,
  | 'salaryPerDay'
  | 'salaryPerHour'
  | 'salaryOfWorkingDays'
  | 'normalOtPay'
  | 'specialOtPay'
  | 'absenceDeduction'
  | 'lateDeduction'
  | 'finalSalary'
  | 'paidSalary'
> {
  return computeRowAmounts({
    totalSalary: row.totalSalary,
    realWorkingDays: row.realWorkingDays,
    absentDays: row.unexcusedAbsenceDays,
    lateMinutes: Math.round((row.lateHours ?? 0) * 60),
    manual: {
      worksheetData: null,
      totalSalary: row.totalSalary,
      realWorkingDays: row.realWorkingDays,
      unexcusedAbsenceDays: row.unexcusedAbsenceDays,
      lateHours: row.lateHours,
      normalOtHours: row.normalOtHours,
      specialOtHours: row.specialOtHours,
      otherDeductions: row.otherDeductions,
      adjustments: row.adjustments,
      otherExpenses: row.otherExpenses,
      paidSalary: row.paidSalary,
      adminComments: null,
      hrComments: null,
      notes: null,
    },
    lateDeductionPerMinute,
  });
}

const LOCKED_PAYROLL_STATUSES = new Set<PayrollStatus>([
  PayrollStatus.LOCKED,
  PayrollStatus.FINAL_APPROVED,
]);

function sheetRowToPayrollLine(row: MonthlySheetRow) {
  const salaryOfWorkingDays = round2(row.salaryOfWorkingDays ?? 0);
  const normalOtPay = round2(row.normalOtPay ?? 0);
  const specialOtPay = round2(row.specialOtPay ?? 0);
  const otherExpenses = round2(row.otherExpenses ?? 0);
  const grossSalary = round2(salaryOfWorkingDays + normalOtPay + specialOtPay + otherExpenses);

  const absenceDeduction = round2(row.absenceDeduction ?? 0);
  const lateDeduction = round2(row.lateDeduction ?? 0);
  const otherDeductions = round2(row.otherDeductions ?? 0);
  const totalDeductions = round2(absenceDeduction + lateDeduction + otherDeductions);
  const adjustments = round2(row.adjustments ?? 0);

  const netSalary = round2(row.paidSalary ?? row.finalSalary ?? grossSalary - totalDeductions + adjustments);

  const commentParts = [row.adminComments, row.hrComments].filter((c) => c && String(c).trim());
  const adjustmentNotes = commentParts.length ? commentParts.join(' | ') : null;

  return {
    employeeId: row.employeeUserId,
    snapshotEmployeeId: row.employeeNo || null,
    snapshotBasicSalary: round2(row.totalSalary ?? 0),
    snapshotAllowance1: normalOtPay + specialOtPay,
    snapshotAllowance2: otherExpenses,
    snapshotTotalAllowances: normalOtPay + specialOtPay + otherExpenses,
    snapshotDepartment: row.jobName || null,
    grossSalary,
    totalDeductions,
    netSalary,
    totalWorkingDays: row.realWorkingDays ?? 0,
    totalAbsentDays: row.unexcusedAbsenceDays ?? 0,
    totalLateInstances: 0,
    totalLateMinutes: Math.round((row.lateHours ?? 0) * 60),
    totalEarlyLeaveMinutes: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absenceDeduction,
    lateDeduction,
    unpaidLeaveDeduction: 0,
    manualAdjustments: adjustments,
    adjustmentNotes,
  };
}

/** Re-sync payroll line snapshots from the HR monthly salary sheet (source of truth). */
export async function syncPayrollRunLinesFromSalarySheet(payrollRunId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!run) return null;

  const sheet = await getMonthlySalarySheet({
    year: run.periodYear,
    month: run.periodMonth,
  });
  const rowByEmployee = new Map(sheet.rows.map((r) => [r.employeeUserId, r]));

  const lines = await prisma.payrollLine.findMany({
    where: { payrollRunId },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeId: true, department: true, company: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const persist = !LOCKED_PAYROLL_STATUSES.has(run.status);

  for (const line of lines) {
    const sheetRow = rowByEmployee.get(line.employeeId);
    if (!sheetRow) continue;

    const updates = sheetRowToPayrollLine(sheetRow);
    if (persist) {
      await prisma.payrollLine.update({
        where: { id: line.id },
        data: {
          snapshotEmployeeId: updates.snapshotEmployeeId,
          snapshotBasicSalary: updates.snapshotBasicSalary,
          snapshotAllowance1: updates.snapshotAllowance1,
          snapshotAllowance2: updates.snapshotAllowance2,
          snapshotTotalAllowances: updates.snapshotTotalAllowances,
          snapshotDepartment: updates.snapshotDepartment,
          grossSalary: updates.grossSalary,
          totalDeductions: updates.totalDeductions,
          netSalary: updates.netSalary,
          totalWorkingDays: updates.totalWorkingDays,
          totalAbsentDays: updates.totalAbsentDays,
          totalLateInstances: updates.totalLateInstances,
          totalLateMinutes: updates.totalLateMinutes,
          totalEarlyLeaveMinutes: updates.totalEarlyLeaveMinutes,
          paidLeaveDays: updates.paidLeaveDays,
          unpaidLeaveDays: updates.unpaidLeaveDays,
          absenceDeduction: updates.absenceDeduction,
          lateDeduction: updates.lateDeduction,
          unpaidLeaveDeduction: updates.unpaidLeaveDeduction,
          manualAdjustments: updates.manualAdjustments,
          adjustmentNotes: updates.adjustmentNotes,
        },
      });
    }
  }

  if (persist && lines.length) {
    const sheetRowsForRun = lines
      .map((l) => rowByEmployee.get(l.employeeId))
      .filter((r): r is MonthlySheetRow => r != null);
    const runTotals = payrollTotalsFromPayableSheetRows(sheetRowsForRun);
    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        totalEmployees: runTotals.totalEmployees,
        totalGross: runTotals.totalGross,
        totalDeductions: runTotals.totalDeductions,
        totalNet: runTotals.totalNet,
      },
    });
  }

  const refreshed = await prisma.payrollLine.findMany({
    where: { payrollRunId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          department: true,
          company: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const companyByUser = await resolvePayrollLineCompanyNames(refreshed.map((line) => line.employeeId));

  return refreshed
    .map((line) => {
      const resolvedCompanyName = companyByUser.get(line.employeeId) ?? null;
      return {
        ...line,
        resolvedCompanyName,
        sheetRow: rowByEmployee.get(line.employeeId) ?? null,
        employee: line.employee
          ? {
              ...line.employee,
              company: resolvedCompanyName ?? line.employee.company,
            }
          : line.employee,
      };
    })
    .sort((a, b) => {
      const nameA =
        a.sheetRow?.personName?.trim() ||
        [a.employee?.firstName, a.employee?.lastName].filter(Boolean).join(' ').trim() ||
        '';
      const nameB =
        b.sheetRow?.personName?.trim() ||
        [b.employee?.firstName, b.employee?.lastName].filter(Boolean).join(' ').trim() ||
        '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
}

/** Run-level totals aligned with the HR salary sheet (payable rows only). */
export function payrollTotalsFromPayableSheetRows(rows: MonthlySheetRow[]) {
  const totals = sumTotals(rows);
  const totalGross = round2(
    totals.salaryOfWorkingDays + totals.normalOtPay + totals.specialOtPay + totals.otherExpenses,
  );
  const totalDeductions = round2(
    totals.absenceDeduction + totals.lateDeduction + totals.otherDeductions,
  );
  const totalNet = round2(
    rows.reduce((acc, r) => acc + (r.paidSalary ?? r.finalSalary ?? 0), 0),
  );
  return {
    totalEmployees: rows.length,
    totalGross,
    totalDeductions,
    totalNet,
    totalAdjustments: totals.adjustments,
    totalFinalSalary: totals.finalSalary,
  };
}

/** Create or refresh a payroll run from the HR monthly salary worksheet. */
export async function createPayrollRunFromMonthlySheet(params: {
  year: number;
  month: number;
  companyId?: string;
  userId: string;
}) {
  const { year, month, companyId, userId } = params;

  const sheet = await getMonthlySalarySheet({ year, month, companyId });
  const payableRows = sheet.rows.filter((row) => {
    const net = row.paidSalary ?? row.finalSalary;
    return net != null && net > 0;
  });

  if (!payableRows.length) {
    const err = new Error(
      'No payable salary rows found. Enter final/paid salary values on the sheet before running payroll.',
    );
    (err as Error & { code?: string }).code = 'NO_PAYROLL_DATA';
    throw err;
  }

  const settingsRow = await prisma.payrollSettings.findFirst({ orderBy: { createdAt: 'desc' } });
  const payrollSettings = settingsRow
    ? {
        gracePeriodMinutes: Number(settingsRow.gracePeriodMinutes),
        lateDeductionPerMinute: Number(settingsRow.lateDeductionPerMinute),
        absenceDeductionType: settingsRow.absenceDeductionType,
        absenceDeductionValue: Number(settingsRow.absenceDeductionValue),
        unpaidLeaveDeductionType: settingsRow.unpaidLeaveDeductionType,
        unpaidLeaveDeductionValue: Number(settingsRow.unpaidLeaveDeductionValue),
      }
    : DEFAULT_SETTINGS;

  const periodStart = dateFromYyyyMmDd(sheet.periodStart);
  const periodEnd = dateFromYyyyMmDd(sheet.periodEnd);

  const existing = await prisma.payrollRun.findUnique({
    where: { periodMonth_periodYear: { periodMonth: month, periodYear: year } },
  });

  if (existing && LOCKED_PAYROLL_STATUSES.has(existing.status)) {
    const err = new Error('Payroll for this month is already finalized and cannot be overwritten.');
    (err as Error & { code?: string }).code = 'PAYROLL_LOCKED';
    throw err;
  }

  let payrollRunId: string;
  let created = false;

  if (existing) {
    payrollRunId = existing.id;
    await prisma.$transaction(async (tx) => {
      await tx.payrollLine.deleteMany({ where: { payrollRunId: existing.id } });
      await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          periodStart,
          periodEnd,
          status: PayrollStatus.HR_PENDING,
          settingsSnapshot: JSON.parse(JSON.stringify(payrollSettings)),
        },
      });
    });
  } else {
    const run = await prisma.payrollRun.create({
      data: {
        periodStart,
        periodEnd,
        periodMonth: month,
        periodYear: year,
        status: PayrollStatus.HR_PENDING,
        settingsSnapshot: JSON.parse(JSON.stringify(payrollSettings)),
        createdById: userId,
      },
    });
    payrollRunId = run.id;
    created = true;
  }

  const runTotals = payrollTotalsFromPayableSheetRows(payableRows);

  for (const row of payableRows) {
    const line = sheetRowToPayrollLine(row);
    await prisma.payrollLine.create({
      data: {
        payrollRunId,
        ...line,
        payslipGenerated: true,
        payslipGeneratedAt: new Date(),
      },
    });
  }

  await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: {
      totalEmployees: runTotals.totalEmployees,
      totalGross: runTotals.totalGross,
      totalDeductions: runTotals.totalDeductions,
      totalNet: runTotals.totalNet,
    },
  });

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId,
      action: created ? 'CREATE_PAYROLL_RUN' : 'REFRESH_FROM_SALARY_SHEET',
      performedById: userId,
      details: {
        source: 'salary_monthly_sheet',
        periodMonth: month,
        periodYear: year,
        companyId: companyId ?? null,
        employeesIncluded: payableRows.length,
      },
    },
  });

  await publishMonthlySalaryToEmployees({ year, month, publishedById: userId });

  const run = await prisma.payrollRun.findUnique({
    where: { id: payrollRunId },
    include: {
      lines: {
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeId: true, department: true },
          },
        },
      },
    },
  });

  return { run, created, refreshed: !created };
}

function payslipNetFromLine(line: {
  paidSalary: Prisma.Decimal | null;
  worksheetData: Prisma.JsonValue | null;
}): number | null {
  const paid = toNum(line.paidSalary);
  if (paid != null && paid > 0) return paid;
  if (
    line.worksheetData != null &&
    typeof line.worksheetData === 'object' &&
    !Array.isArray(line.worksheetData)
  ) {
    const ws = line.worksheetData as Record<string, unknown>;
    const finalSalary = toNum(ws.finalSalary as number | null);
    const paidSalary = toNum(ws.paidSalary as number | null);
    if (paidSalary != null && paidSalary > 0) return paidSalary;
    if (finalSalary != null && finalSalary > 0) return finalSalary;
  }
  return null;
}

/** Mark all saved monthly lines for a period as visible to employees. */
export async function publishMonthlySalaryToEmployees(params: {
  year: number;
  month: number;
  publishedById: string;
}) {
  const { year, month, publishedById } = params;
  const now = new Date();

  const lines = await prisma.salaryMonthlyLine.findMany({
    where: { year, month },
  });

  const payableIds = lines
    .filter((line) => {
      const net = payslipNetFromLine(line);
      return net != null && net > 0;
    })
    .map((l) => l.id);

  if (!payableIds.length) {
    const err = new Error('No saved salary rows with a final/paid amount to publish.');
    (err as Error & { code?: string }).code = 'NO_PUBLISH_DATA';
    throw err;
  }

  await prisma.salaryMonthlyLine.updateMany({
    where: { id: { in: payableIds } },
    data: { publishedAt: now, publishedById },
  });

  const employeeIds = [
    ...new Set(
      lines
        .filter((line) => payableIds.includes(line.id))
        .map((line) => line.employeeId),
    ),
  ];
  notifyEmployeesSalaryPublished({
    year,
    month,
    employeeIds,
    lines: lines.filter((line) => payableIds.includes(line.id)),
  });

  return { publishedCount: payableIds.length, publishedAt: now };
}

/** Hide employee payslips when HR removes the payroll run for that month. */
export async function unpublishMonthlySalaryForPeriod(year: number, month: number) {
  const result = await prisma.salaryMonthlyLine.updateMany({
    where: { year, month, publishedAt: { not: null } },
    data: { publishedAt: null, publishedById: null },
  });
  return { unpublishedCount: result.count };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function notifyEmployeesSalaryPublished(params: {
  year: number;
  month: number;
  employeeIds: string[];
  lines: Array<{ employeeId: string; id: string }>;
}) {
  const { year, month, employeeIds, lines } = params;
  const periodLabel = `${MONTH_NAMES[month - 1] || month} ${year}`;
  const createdAt = new Date().toISOString();

  void (async () => {
    const lineByEmployee = new Map(lines.map((l) => [l.employeeId, l.id]));
    const fullLines = await prisma.salaryMonthlyLine.findMany({
      where: { id: { in: lines.map((l) => l.id) } },
    });
    const lineById = new Map(fullLines.map((l) => [l.id, l]));

    for (const employeeId of employeeIds) {
      emitErpNotification(employeeId, {
        id: `salary-pub-${year}-${month}-${employeeId}-${Date.now()}`,
        type: 'salary_payslip_published',
        title: 'Congratulations! Your salary is ready',
        message: `Your ${periodLabel} salary has been processed. Kindly check Salary Details in your profile or My Payroll. If you have any issue, raise it there.`,
        read: false,
        createdAt,
        periodMonth: month,
        periodYear: year,
      });

      const lineId = lineByEmployee.get(employeeId);
      const line = lineId ? lineById.get(lineId) : null;
      const net = line ? payslipNetFromLine(line) : null;
      if (net == null || net <= 0) continue;

      const user = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true, email: true, firstName: true, lastName: true, employeeId: true },
      });
      if (!user?.email) continue;

      void notifySalaryCreditedEmail({
        employee: user,
        year,
        month,
        netSalary: net,
        currency: 'AED',
      });
    }
  })();
}

export type EmployeePublishedPayslipSummary = {
  year: number;
  month: number;
  publishedAt: string;
  netSalary: number;
  personName: string | null;
  employeeNo: string | null;
  payrollRunId: string | null;
};

/** List published monthly payslips for one employee. */
export async function getEmployeePublishedPayslips(
  employeeId: string,
): Promise<EmployeePublishedPayslipSummary[]> {
  const lines = await prisma.salaryMonthlyLine.findMany({
    where: { employeeId, publishedAt: { not: null } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const results: EmployeePublishedPayslipSummary[] = [];

  for (const line of lines) {
    const net = payslipNetFromLine(line);
    if (net == null || net <= 0) continue;

    let personName: string | null = null;
    let employeeNo: string | null = null;
    if (
      line.worksheetData != null &&
      typeof line.worksheetData === 'object' &&
      !Array.isArray(line.worksheetData)
    ) {
      const ws = line.worksheetData as Record<string, unknown>;
      personName = typeof ws.personName === 'string' ? ws.personName : null;
      employeeNo = typeof ws.employeeNo === 'string' ? ws.employeeNo : null;
    }

    const payrollLine = await prisma.payrollLine.findFirst({
      where: {
        employeeId,
        payrollRun: { periodYear: line.year, periodMonth: line.month },
      },
      select: { payrollRunId: true },
      orderBy: { createdAt: 'desc' },
    });

    results.push({
      year: line.year,
      month: line.month,
      publishedAt: line.publishedAt!.toISOString(),
      netSalary: net,
      personName,
      employeeNo,
      payrollRunId: payrollLine?.payrollRunId ?? null,
    });
  }

  return results;
}

export type EmployeePayslipRequestView = {
  id: string;
  message: string;
  status: 'OPEN' | 'RESOLVED' | 'REJECTED';
  hrResponse: string | null;
  createdAt: string;
  respondedAt: string | null;
};

export type EmployeePublishedPayslipDetail = {
  year: number;
  month: number;
  publishedAt: string;
  worksheet: Record<string, unknown> | null;
  payrollRunId: string | null;
  openRequest: { id: string; message: string; createdAt: string } | null;
  latestRequest: EmployeePayslipRequestView | null;
};

/** Full published payslip for one employee/month. */
export async function getEmployeePublishedPayslipDetail(
  employeeId: string,
  year: number,
  month: number,
): Promise<EmployeePublishedPayslipDetail | null> {
  const line = await prisma.salaryMonthlyLine.findUnique({
    where: { year_month_employeeId: { year, month, employeeId } },
  });

  if (!line?.publishedAt) return null;

  const worksheet =
    line.worksheetData != null &&
    typeof line.worksheetData === 'object' &&
    !Array.isArray(line.worksheetData)
      ? (line.worksheetData as Record<string, unknown>)
      : null;

  const payrollLine = await prisma.payrollLine.findFirst({
    where: {
      employeeId,
      payrollRun: { periodYear: year, periodMonth: month },
    },
    select: { payrollRunId: true },
    orderBy: { createdAt: 'desc' },
  });

  const openRequest = await prisma.salaryPayslipRequest.findFirst({
    where: { employeeId, year, month, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });

  const latestRequestRow = await prisma.salaryPayslipRequest.findFirst({
    where: { employeeId, year, month },
    orderBy: { createdAt: 'desc' },
  });

  const latestRequest: EmployeePayslipRequestView | null = latestRequestRow
    ? {
        id: latestRequestRow.id,
        message: latestRequestRow.message,
        status: latestRequestRow.status,
        hrResponse: latestRequestRow.hrResponse,
        createdAt: latestRequestRow.createdAt.toISOString(),
        respondedAt: latestRequestRow.respondedAt?.toISOString() ?? null,
      }
    : null;

  return {
    year,
    month,
    publishedAt: line.publishedAt.toISOString(),
    worksheet,
    payrollRunId: payrollLine?.payrollRunId ?? null,
    openRequest: openRequest
      ? {
          id: openRequest.id,
          message: openRequest.message,
          createdAt: openRequest.createdAt.toISOString(),
        }
      : null,
    latestRequest,
  };
}

export async function createSalaryPayslipRequest(params: {
  employeeId: string;
  year: number;
  month: number;
  message: string;
}) {
  const { employeeId, year, month, message } = params;
  const trimmed = message.trim();
  if (!trimmed) {
    const err = new Error('Message is required');
    (err as Error & { code?: string }).code = 'VALIDATION';
    throw err;
  }

  const payslip = await getEmployeePublishedPayslipDetail(employeeId, year, month);
  if (!payslip) {
    const err = new Error('No published payslip found for this period');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  if (payslip.openRequest) {
    const err = new Error('You already have an open request for this month. HR will review it soon.');
    (err as Error & { code?: string }).code = 'DUPLICATE';
    throw err;
  }

  return prisma.salaryPayslipRequest.create({
    data: { employeeId, year, month, message: trimmed },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          department: true,
        },
      },
    },
  }).then((request) => {
    void notifyPayslipRequestEmail({
      employee: request.employee,
      year,
      month,
      message: trimmed,
    });
    return request;
  });
}

export async function listSalaryPayslipRequests(params: {
  year?: number;
  month?: number;
  status?: 'OPEN' | 'RESOLVED' | 'REJECTED';
}) {
  const where: Prisma.SalaryPayslipRequestWhereInput = {};
  if (params.year != null) where.year = params.year;
  if (params.month != null) where.month = params.month;
  if (params.status) where.status = params.status;

  return prisma.salaryPayslipRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          department: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function respondToSalaryPayslipRequest(params: {
  requestId: string;
  status: 'RESOLVED' | 'REJECTED';
  hrResponse: string;
  respondedById: string;
}) {
  const { requestId, status, hrResponse, respondedById } = params;
  const trimmed = hrResponse.trim();
  if (!trimmed) {
    const err = new Error('HR response is required');
    (err as Error & { code?: string }).code = 'VALIDATION';
    throw err;
  }

  const existing = await prisma.salaryPayslipRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    const err = new Error('Request not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  return prisma.salaryPayslipRequest.update({
    where: { id: requestId },
    data: {
      status,
      hrResponse: trimmed,
      respondedById,
      respondedAt: new Date(),
    },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeId: true },
      },
    },
  });
}
