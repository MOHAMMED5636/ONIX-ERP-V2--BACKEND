import ExcelJS from 'exceljs';
import {
  ATTENDANCE_MONTHLY_ENTRY_SCHEMA,
  ATTENDANCE_MONTHLY_NAMES_SCHEMA,
  type MonthlyExcelLayout,
} from '../config/attendanceMonthlyExcelSchema';
import { buildXlsxBuffer } from './excel';
import {
  listEmployeesForManualAttendanceMonth,
  monthPeriodFromYearMonth,
  type ManualAttendanceEmployeeRow,
} from './attendance-manual-entry';

function schemaForLayout(layout: MonthlyExcelLayout) {
  return layout === 'names' ? ATTENDANCE_MONTHLY_NAMES_SCHEMA : ATTENDANCE_MONTHLY_ENTRY_SCHEMA;
}

function employeeToNamesRow(emp: ManualAttendanceEmployeeRow): Record<string, string> {
  return {
    employeeId: emp.employeeId ?? '',
    employeeName: emp.employeeName ?? '',
    department: emp.department ?? '',
    company: emp.company ?? '',
    periodStart: emp.periodStartDate ?? '',
    periodEnd: emp.periodEndDate ?? '',
  };
}

function employeesToEntryRows(employees: ManualAttendanceEmployeeRow[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const emp of employees) {
    for (const day of emp.dailyRecords ?? []) {
      rows.push({
        employeeId: emp.employeeId ?? '',
        employeeName: emp.employeeName ?? '',
        attendanceDate: day.date,
        checkInTime: day.checkInTime ?? '',
        checkOutTime: day.checkOutTime ?? '',
        status: day.status ?? '',
      });
    }
  }
  return rows;
}

async function buildMonthlyWorkbook(opts: {
  layout: MonthlyExcelLayout;
  year: number;
  month: number;
  rows: Record<string, string>[];
  sheetTitle: string;
}): Promise<ExcelJS.Workbook> {
  const schema = schemaForLayout(opts.layout);
  const period = monthPeriodFromYearMonth(opts.year, opts.month);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ONIX ERP';
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.sheetTitle.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 2 }],
  });
  const instr = wb.addWorksheet('Instructions');

  const labels = schema.map((f) => `${f.label}${f.required ? ' *' : ''}`);
  const keys = schema.map((f) => f.key);
  ws.addRow(labels);
  ws.addRow(keys);
  ws.getRow(2).hidden = true;

  for (const row of opts.rows) {
    ws.addRow(keys.map((k) => row[k] ?? ''));
  }

  ws.getRow(1).font = { bold: true };
  schema.forEach((f, idx) => {
    ws.getColumn(idx + 1).width = Math.max(14, Math.min(36, (f.label.length || 10) + 6));
  });

  instr.addRow(['Monthly Attendance Manual Entry']);
  instr.getRow(1).font = { bold: true, size: 14 };
  instr.addRow([]);
  instr.addRow([`Period: ${period.monthLabel} ${period.year} (${period.startDate} to ${period.endDate})`]);
  instr.addRow([]);
  instr.addRow(['1) Row 1 = column labels, row 2 = hidden keys. Data starts at row 3.']);
  if (opts.layout === 'names') {
    instr.addRow(['2) This sheet lists all employees for the period (names and IDs only).']);
    instr.addRow(['3) Download the Entry sheet to fill check-in / check-out times per day.']);
  } else {
    instr.addRow(['2) Fill Check-in Time, Check-out Time, and Status for each row.']);
    instr.addRow(['3) Times: 08:00 AM, 06:30 PM (office local timezone).']);
    instr.addRow(['4) Status: PRESENT, LATE, ABSENT, ON_LEAVE, EARLY_DEPARTURE, VACATION, PUBLIC_HOLIDAY, OUT_OF_LOCATION']);
    instr.addRow(['5) Import the filled file from Attendance Management → Import / Export.']);
  }
  instr.addRow(['6) Do not change Employee ID or Attendance Date when importing.']);
  instr.columns = [{ width: 95 }];

  return wb;
}

function filterEmployeesForExcelScope(
  employees: ManualAttendanceEmployeeRow[],
  scope: 'all' | 'one' | 'selected',
  employeeId?: string,
  employeeIds?: string[],
): ManualAttendanceEmployeeRow[] {
  if (scope === 'one') {
    const id = (employeeId || '').trim();
    if (!id) {
      throw new Error('employeeId is required when scope=one');
    }
    const filtered = employees.filter(
      (e) =>
        (e.employeeId || '').toLowerCase() === id.toLowerCase() ||
        e.userId === id,
    );
    if (!filtered.length) {
      throw new Error(`Employee not found: ${id}`);
    }
    return filtered;
  }

  if (scope === 'selected') {
    const ids = (employeeIds ?? [])
      .map((x) => x.trim())
      .filter(Boolean);
    if (!ids.length) {
      throw new Error('employeeIds is required when scope=selected');
    }
    const idSet = new Set(ids.map((x) => x.toLowerCase()));
    const filtered = employees.filter(
      (e) =>
        idSet.has((e.employeeId || '').toLowerCase()) || idSet.has(e.userId.toLowerCase()),
    );
    if (!filtered.length) {
      throw new Error('No matching employees for the selected IDs');
    }
    return filtered;
  }

  return employees;
}

export async function buildMonthlyAttendanceExcelBuffer(opts: {
  year: number;
  month: number;
  layout: MonthlyExcelLayout;
  scope: 'all' | 'one' | 'selected';
  employeeId?: string;
  employeeIds?: string[];
  companyId?: string;
  search?: string;
  includeExisting?: boolean;
}): Promise<{ buffer: Buffer; filename: string; period: ReturnType<typeof monthPeriodFromYearMonth> }> {
  const period = monthPeriodFromYearMonth(opts.year, opts.month);
  const { employees } = await listEmployeesForManualAttendanceMonth(opts.year, opts.month, {
    companyId: opts.companyId,
    search: opts.search,
  });

  const filtered = filterEmployeesForExcelScope(
    employees,
    opts.scope,
    opts.employeeId,
    opts.employeeIds,
  );

  let rows: Record<string, string>[];
  if (opts.layout === 'names') {
    rows = filtered.map(employeeToNamesRow);
  } else {
    rows = employeesToEntryRows(filtered);
    if (!opts.includeExisting) {
      rows = rows.map((r) => ({
        ...r,
        checkInTime: '',
        checkOutTime: '',
        status: '',
      }));
    }
  }

  const scopeSuffix =
    opts.scope === 'one'
      ? `-${(opts.employeeId || 'employee').replace(/[^\w-]/g, '_')}`
      : opts.scope === 'selected'
        ? `-selected-${filtered.length}`
        : '-all';
  const layoutSuffix = opts.layout === 'names' ? 'names' : 'entry';
  const filename = `attendance-${layoutSuffix}-${period.year}-${String(period.month).padStart(2, '0')}${scopeSuffix}.xlsx`;

  const wb = await buildMonthlyWorkbook({
    layout: opts.layout,
    year: opts.year,
    month: opts.month,
    rows,
    sheetTitle: opts.layout === 'names' ? 'Employee Names' : 'Monthly Entry',
  });

  const buffer = await buildXlsxBuffer(wb);
  return { buffer, filename, period };
}
