import { Response } from 'express';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { ATTENDANCE_MONTHLY_ENTRY_SCHEMA } from '../config/attendanceMonthlyExcelSchema';
import { buildMonthlyAttendanceExcelBuffer } from '../utils/attendance-monthly-excel';
import {
  isValidYearMonth,
  saveManualAttendanceEntries,
  type ManualAttendanceSaveEntry,
} from '../utils/attendance-manual-entry';
import { buildXlsxBuffer, importCellString, safeCellString } from '../utils/excel';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseYearMonth(req: AuthRequest): { year: number; month: number } | null {
  const yearRaw =
    req.query.year != null && req.query.year !== '' ? String(req.query.year).trim() : '';
  const monthRaw =
    req.query.month != null && req.query.month !== '' ? String(req.query.month).trim() : '';
  if (!yearRaw || !monthRaw) return null;
  const year = parseInt(yearRaw, 10);
  const month = parseInt(monthRaw, 10);
  if (!isValidYearMonth(year, month)) return null;
  return { year, month };
}

function parseLayout(v: unknown): 'names' | 'entry' {
  return String(v || '').trim().toLowerCase() === 'names' ? 'names' : 'entry';
}

function parseScope(v: unknown): 'all' | 'one' | 'selected' {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'one') return 'one';
  if (s === 'selected') return 'selected';
  return 'all';
}

function parseEmployeeIdsQuery(req: AuthRequest): string[] | undefined {
  const raw = req.query.employeeIds;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * GET /api/attendance/manual-entry/excel/template?year=2026&month=6&layout=names|entry&scope=all|one&employeeId=
 */
export const downloadMonthlyManualEntryTemplate = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const ym = parseYearMonth(req);
    if (!ym) {
      res.status(400).json({ success: false, message: 'Query parameters year and month are required' });
      return;
    }

    const layout = parseLayout(req.query.layout);
    const scope = parseScope(req.query.scope);
    const employeeId =
      typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : undefined;
    const employeeIds = parseEmployeeIdsQuery(req);
    const companyId =
      typeof req.query.companyId === 'string' ? req.query.companyId.trim() : undefined;

    const { buffer, filename } = await buildMonthlyAttendanceExcelBuffer({
      year: ym.year,
      month: ym.month,
      layout,
      scope,
      employeeId,
      employeeIds,
      companyId,
      includeExisting: false,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('downloadMonthlyManualEntryTemplate error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate template';
    res.status(500).json({ success: false, message: msg });
  }
};

/**
 * GET /api/attendance/manual-entry/excel/export?year=2026&month=6&scope=all|one&employeeId=
 */
export const exportMonthlyManualEntryExcel = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const ym = parseYearMonth(req);
    if (!ym) {
      res.status(400).json({ success: false, message: 'Query parameters year and month are required' });
      return;
    }

    const scope = parseScope(req.query.scope);
    const employeeId =
      typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : undefined;
    const employeeIds = parseEmployeeIdsQuery(req);
    const companyId =
      typeof req.query.companyId === 'string' ? req.query.companyId.trim() : undefined;

    const { buffer, filename } = await buildMonthlyAttendanceExcelBuffer({
      year: ym.year,
      month: ym.month,
      layout: 'entry',
      scope,
      employeeId,
      employeeIds,
      companyId,
      includeExisting: true,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('exportMonthlyManualEntryExcel error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to export attendance';
    res.status(500).json({ success: false, message: msg });
  }
};

/**
 * POST /api/attendance/manual-entry/excel/import
 * multipart: file + optional year, month in body
 */
export const importMonthlyManualEntryExcel = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const yearRaw = body.year != null ? String(body.year).trim() : '';
    const monthRaw = body.month != null ? String(body.month).trim() : '';
    const year = parseInt(yearRaw, 10);
    const month = parseInt(monthRaw, 10);
    if (!isValidYearMonth(year, month)) {
      res.status(400).json({
        success: false,
        message: 'Body fields year and month are required (e.g. year=2026, month=6)',
      });
      return;
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet =
      workbook.Sheets['Monthly Entry'] ||
      workbook.Sheets['Employee Names'] ||
      workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      res.status(400).json({ success: false, message: 'Invalid Excel file (no sheets)' });
      return;
    }

    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown[][];
    if (!rows.length || rows.length < 2) {
      res.status(400).json({ success: false, message: 'File is empty' });
      return;
    }

    const headerKeys = (rows[1] || []).map((x) => safeCellString(x));
    const expectedKeys = ATTENDANCE_MONTHLY_ENTRY_SCHEMA.map((f) => f.key);
    if (headerKeys.join('|') !== expectedKeys.join('|')) {
      res.status(400).json({
        success: false,
        message:
          'Use the Monthly Entry template (not the names-only sheet). Download a fresh entry template and try again.',
      });
      return;
    }

    const dataRows = rows.slice(2);
    const errors: Array<{ rowNumber: number; field: string; message: string }> = [];
    const saveEntries: ManualAttendanceSaveEntry[] = [];
    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 3;
      const cells = dataRows[i] || [];
      const row: Record<string, string> = {};
      expectedKeys.forEach((key, idx) => {
        row[key] = importCellString(cells[idx]);
      });

      const empId = row.employeeId.trim();
      const ymd = row.attendanceDate.trim();
      const checkIn = row.checkInTime.trim();
      const checkOut = row.checkOutTime.trim();
      const status = row.status.trim();

      if (!empId && !ymd && !checkIn && !checkOut && !status) continue;

      processed += 1;

      if (!empId) {
        errors.push({ rowNumber, field: 'employeeId', message: 'Employee ID is required' });
        continue;
      }
      if (!ymd || !YMD.test(ymd)) {
        errors.push({ rowNumber, field: 'attendanceDate', message: 'Valid date YYYY-MM-DD required' });
        continue;
      }

      const [ry, rm] = ymd.split('-').map((x) => parseInt(x, 10));
      if (ry !== year || rm !== month) {
        errors.push({
          rowNumber,
          field: 'attendanceDate',
          message: `Date must fall in ${year}-${String(month).padStart(2, '0')}`,
        });
        continue;
      }

      if (!checkIn && !checkOut && !status) {
        skipped += 1;
        continue;
      }

      const user = await prisma.user.findFirst({
        where: { employeeId: { equals: empId, mode: 'insensitive' }, isActive: true },
        select: { id: true },
      });
      if (!user) {
        errors.push({ rowNumber, field: 'employeeId', message: `Employee not found: ${empId}` });
        continue;
      }

      saveEntries.push({
        userId: user.id,
        date: ymd,
        checkInTime: checkIn || null,
        checkOutTime: checkOut || null,
        status: status || null,
      });
    }

    const result = await saveManualAttendanceEntries(null, saveEntries, req.user?.id);

    let errorReportBase64: string | undefined;
    const allErrors = [
      ...errors.map((e) => ({ userId: '', date: '', message: `Row ${e.rowNumber} (${e.field}): ${e.message}` })),
      ...(result.errors || []),
    ];
    if (allErrors.length) {
      const errWb = new ExcelJS.Workbook();
      const errWs = errWb.addWorksheet('Import Errors');
      errWs.addRow(['Row / Employee', 'Date', 'Message']);
      errors.forEach((e) => errWs.addRow([e.rowNumber, e.field, e.message]));
      result.errors.forEach((e) => errWs.addRow([e.userId, e.date ?? '', e.message]));
      errorReportBase64 = (await buildXlsxBuffer(errWb)).toString('base64');
    }

    res.json({
      success: true,
      data: {
        processed,
        skipped,
        saved: result.saved,
        failed: result.failed + errors.length,
        errorCount: allErrors.length,
        errorReportBase64,
      },
    });
  } catch (error) {
    console.error('importMonthlyManualEntryExcel error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Import failed',
    });
  }
};
