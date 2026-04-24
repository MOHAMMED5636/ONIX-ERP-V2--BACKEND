import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { EMPLOYEE_IMPORT_SCHEMA } from '../config/employeeImportSchema';
import { buildXlsxBuffer, safeCellString } from '../utils/excel';

const VALID_ROLES = ['EMPLOYEE', 'PROJECT_MANAGER', 'TENDER_ENGINEER', 'HR', 'ADMIN'] as const;

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function parseBoolean(v: string): boolean {
  const t = (v || '').trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

function parseIntOrNull(v: string): number | null {
  const t = (v || '').trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(v: string): Date | null {
  const t = (v || '').trim();
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d;
}

async function generateUniqueEmail(firstName: string, lastName: string): Promise<string> {
  const base = `${String(firstName).toLowerCase()}.${String(lastName).toLowerCase()}@onixgroup.ae`;
  let email = base;
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) return email;
    email = `${String(firstName).toLowerCase()}.${String(lastName).toLowerCase()}${counter}@onixgroup.ae`;
    counter += 1;
  }
}

function splitCommaList(v: string): string[] {
  const t = (v || '').trim();
  if (!t) return [];
  return t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function passportExpiryAtLeast6Months(expiry: Date): boolean {
  const today = new Date();
  const sixMonthsFromNow = new Date(today);
  sixMonthsFromNow.setMonth(today.getMonth() + 6);
  return expiry >= sixMonthsFromNow;
}

export const downloadEmployeeTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ONIX ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Employee Template', { views: [{ state: 'frozen', ySplit: 2 }] });
    const instr = wb.addWorksheet('Instructions');
    const lists = wb.addWorksheet('_lists');
    lists.state = 'veryHidden';

    const labels = EMPLOYEE_IMPORT_SCHEMA.map((f) => `${f.label}${f.required ? ' *' : ''}`);
    const keys = EMPLOYEE_IMPORT_SCHEMA.map((f) => f.key);
    ws.addRow(labels);
    ws.addRow(keys);
    ws.getRow(2).hidden = true;
    ws.addRow(EMPLOYEE_IMPORT_SCHEMA.map((f) => f.sample || ''));

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getRow(1).height = 26;

    EMPLOYEE_IMPORT_SCHEMA.forEach((f, idx) => {
      ws.getColumn(idx + 1).width = Math.max(16, Math.min(44, (f.label.length || 10) + 10));
    });

    // Dropdown validations
    let listCol = 1;
    for (const field of EMPLOYEE_IMPORT_SCHEMA) {
      if (field.type !== 'select' || !field.options?.length) continue;
      const colLetter = lists.getColumn(listCol).letter;
      lists.getCell(`${colLetter}1`).value = field.key;
      field.options.forEach((opt, i) => (lists.getCell(`${colLetter}${i + 2}`).value = opt));
      const range = `'_lists'!$${colLetter}$2:$${colLetter}$${field.options.length + 1}`;
      const targetColIdx = EMPLOYEE_IMPORT_SCHEMA.findIndex((f) => f.key === field.key) + 1;
      for (let r = 3; r <= 2002; r++) {
        ws.getCell(r, targetColIdx).dataValidation = {
          type: 'list',
          allowBlank: !field.required,
          formulae: [range],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid value',
          error: `Choose a value from the list for ${field.label}.`,
        };
      }
      listCol += 1;
    }

    // Instructions
    instr.addRow(['Employee Import Instructions']);
    instr.getRow(1).font = { bold: true, size: 14 };
    instr.addRow([]);
    instr.addRow(['1) Fill rows starting from row 3 (row 2 is hidden keys).']);
    instr.addRow(['2) Required columns are marked with * in the header.']);
    instr.addRow(['3) Dates must be in YYYY-MM-DD format.']);
    instr.addRow(['4) Do not change header row names or order.']);
    instr.addRow(['5) Passport fields are required and passport expiry must be at least 6 months from today.']);
    instr.addRow([]);
    instr.addRow(['Field notes']);
    instr.getRow(instr.lastRow!.number).font = { bold: true };
    EMPLOYEE_IMPORT_SCHEMA.filter((f) => f.note).forEach((f) => instr.addRow([`${f.label}: ${f.note}`]));
    instr.columns = [{ width: 120 }];

    const buffer = await buildXlsxBuffer(wb);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.xlsx"');
    res.send(buffer);
  } catch (e: any) {
    console.error('downloadEmployeeTemplate error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate template', error: e?.message });
  }
};

export const importEmployeesExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets['Employee Template'] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      res.status(400).json({ success: false, message: 'Invalid Excel file (no sheets)' });
      return;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as any;
    if (!rows.length || rows.length < 2) {
      res.status(400).json({ success: false, message: 'Template is empty' });
      return;
    }

    const headerKeys = (rows[1] || []).map((x) => safeCellString(x));
    const expectedKeys = EMPLOYEE_IMPORT_SCHEMA.map((f) => f.key);
    if (headerKeys.join('|') !== expectedKeys.join('|')) {
      res.status(400).json({
        success: false,
        message: 'Template columns do not match the current Employee template. Please download a fresh template.',
      });
      return;
    }

    const dataRows = rows.slice(2);
    const errors: Array<{ rowNumber: number; field: string; message: string }> = [];
    let processed = 0;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const excelRowNumber = i + 3;
      const values = dataRows[i] || [];
      const isEmpty = values.every((v) => !safeCellString(v));
      if (isEmpty) continue;
      processed += 1;

      const payload: Record<string, string> = {};
      EMPLOYEE_IMPORT_SCHEMA.forEach((f, idx) => (payload[f.key] = safeCellString(values[idx])));

      // Required
      for (const f of EMPLOYEE_IMPORT_SCHEMA) {
        if (f.required && !payload[f.key]) {
          errors.push({ rowNumber: excelRowNumber, field: f.label, message: 'Required field is missing' });
        }
      }

      // Role
      if (payload.role && !VALID_ROLES.includes(payload.role as any)) {
        errors.push({ rowNumber: excelRowNumber, field: 'Role / Access Level', message: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` });
      }

      // Email
      if (payload.workEmail && !isValidEmail(payload.workEmail)) {
        errors.push({ rowNumber: excelRowNumber, field: 'Primary Email', message: 'Invalid email format' });
      }

      // Dates
      const birthday = payload.birthday ? parseDateOrNull(payload.birthday) : null;
      if (payload.birthday && !birthday) errors.push({ rowNumber: excelRowNumber, field: 'Date of Birth', message: 'Invalid date (YYYY-MM-DD)' });
      const joiningDate = payload.joiningDate ? parseDateOrNull(payload.joiningDate) : null;
      if (payload.joiningDate && !joiningDate) errors.push({ rowNumber: excelRowNumber, field: 'Joining Date', message: 'Invalid date (YYYY-MM-DD)' });
      const exitDate = payload.exitDate ? parseDateOrNull(payload.exitDate) : null;
      if (payload.exitDate && !exitDate) errors.push({ rowNumber: excelRowNumber, field: 'Exit Date', message: 'Invalid date (YYYY-MM-DD)' });

      const passportIssueDate = payload.passportIssueDate ? parseDateOrNull(payload.passportIssueDate) : null;
      if (payload.passportIssueDate && !passportIssueDate) errors.push({ rowNumber: excelRowNumber, field: 'Passport Issue Date', message: 'Invalid date (YYYY-MM-DD)' });
      const passportExpiryDate = payload.passportExpiryDate ? parseDateOrNull(payload.passportExpiryDate) : null;
      if (payload.passportExpiryDate && !passportExpiryDate) errors.push({ rowNumber: excelRowNumber, field: 'Passport Expiry Date', message: 'Invalid date (YYYY-MM-DD)' });
      if (passportExpiryDate && !passportExpiryAtLeast6Months(passportExpiryDate)) {
        errors.push({ rowNumber: excelRowNumber, field: 'Passport Expiry Date', message: 'Passport must be valid for at least 6 months from today' });
      }

      const nationalIdExpiryDate = payload.nationalIdExpiryDate ? parseDateOrNull(payload.nationalIdExpiryDate) : null;
      if (payload.nationalIdExpiryDate && !nationalIdExpiryDate) errors.push({ rowNumber: excelRowNumber, field: 'National ID Expiry Date', message: 'Invalid date (YYYY-MM-DD)' });
      const residencyExpiryDate = payload.residencyExpiryDate ? parseDateOrNull(payload.residencyExpiryDate) : null;
      if (payload.residencyExpiryDate && !residencyExpiryDate) errors.push({ rowNumber: excelRowNumber, field: 'Residency Expiry Date', message: 'Invalid date (YYYY-MM-DD)' });
      const insuranceExpiryDate = payload.insuranceExpiryDate ? parseDateOrNull(payload.insuranceExpiryDate) : null;
      if (payload.insuranceExpiryDate && !insuranceExpiryDate) errors.push({ rowNumber: excelRowNumber, field: 'Insurance Expiry Date', message: 'Invalid date (YYYY-MM-DD)' });
      const drivingLicenseExpiryDate = payload.drivingLicenseExpiryDate ? parseDateOrNull(payload.drivingLicenseExpiryDate) : null;
      if (payload.drivingLicenseExpiryDate && !drivingLicenseExpiryDate) errors.push({ rowNumber: excelRowNumber, field: 'Driving License Expiry Date', message: 'Invalid date (YYYY-MM-DD)' });
      const labourIdExpiryDate = payload.labourIdExpiryDate ? parseDateOrNull(payload.labourIdExpiryDate) : null;
      if (payload.labourIdExpiryDate && !labourIdExpiryDate) errors.push({ rowNumber: excelRowNumber, field: 'Labour ID Expiry Date', message: 'Invalid date (YYYY-MM-DD)' });

      // Age >=18
      if (birthday) {
        const today = new Date();
        let age = today.getFullYear() - birthday.getFullYear();
        const monthDiff = today.getMonth() - birthday.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) age -= 1;
        if (age < 18) errors.push({ rowNumber: excelRowNumber, field: 'Date of Birth', message: 'Employee must be at least 18 years old' });
      }

      // Duplicates: employeeId, email
      if (payload.employeeId) {
        const existing = await prisma.user.findFirst({ where: { employeeId: payload.employeeId }, select: { id: true } });
        if (existing) errors.push({ rowNumber: excelRowNumber, field: 'Employee ID', message: 'Duplicate Employee ID' });
      }
      if (payload.workEmail) {
        const existing = await prisma.user.findFirst({ where: { email: normalizeEmail(payload.workEmail) }, select: { id: true } });
        if (existing) errors.push({ rowNumber: excelRowNumber, field: 'Primary Email', message: 'Duplicate email' });
      }

      const rowErrors = errors.filter((e) => e.rowNumber === excelRowNumber);
      if (rowErrors.length) {
        failed += 1;
        continue;
      }

      // Build JSON arrays
      const phoneNumbers = [payload.phone, ...splitCommaList(payload.phoneNumbers)].filter(Boolean);
      const emailAddresses = [payload.workEmail, ...splitCommaList(payload.emailAddresses)].filter(Boolean);

      const userAccount = parseBoolean(payload.userAccount);
      const email = userAccount && payload.workEmail ? normalizeEmail(payload.workEmail) : await generateUniqueEmail(payload.firstName, payload.lastName);
      const passwordPlain = userAccount && payload.password ? payload.password : 'Temp12345'; // safe fallback; userAccount=false users rarely login
      const passwordHash = await bcrypt.hash(passwordPlain, 10);

      try {
        await prisma.user.create({
          data: {
            email,
            password: passwordHash,
            firstName: payload.firstName,
            lastName: payload.lastName,
            role: (payload.role as any) || 'EMPLOYEE',
            phone: payload.phone || null,
            department: payload.department || null,
            position: payload.position || null,
            jobTitle: payload.jobTitle || null,
            employeeId: payload.employeeId || null,
            employeeType: payload.employeeType || null,
            status: payload.status || null,
            userAccount,
            gender: payload.gender || null,
            maritalStatus: payload.maritalStatus || null,
            nationality: payload.nationality || null,
            birthday,
            childrenCount: parseIntOrNull(payload.childrenCount) ?? null,
            currentAddress: payload.currentAddress || null,
            phoneNumbers: phoneNumbers.length ? JSON.stringify(phoneNumbers) : null,
            emailAddresses: emailAddresses.length ? JSON.stringify(emailAddresses) : null,
            company: payload.company || null,
            companyLocation: payload.companyLocation || null,
            managerId: payload.managerId || null,
            attendanceProgram: payload.attendanceProgram || null,
            joiningDate,
            exitDate,
            isLineManager: parseBoolean(payload.isLineManager),
            passportNumber: payload.passportNumber || null,
            passportIssueDate,
            passportExpiryDate,
            visaNumber: payload.visaNumber || null,
            nationalIdNumber: payload.nationalIdNumber || null,
            nationalIdExpiryDate,
            residencyNumber: payload.residencyNumber || null,
            residencyExpiryDate,
            insuranceNumber: payload.insuranceNumber || null,
            insuranceExpiryDate,
            drivingLicenseNumber: payload.drivingLicenseNumber || null,
            drivingLicenseExpiryDate,
            labourIdNumber: payload.labourIdNumber || null,
            labourIdExpiryDate,
            remarks: payload.remarks || null,
            createdBy: req.user?.id || null,
          },
        });
        imported += 1;
      } catch (e: any) {
        failed += 1;
        errors.push({ rowNumber: excelRowNumber, field: 'Row', message: e?.message ? String(e.message) : 'Failed to create employee' });
      }
    }

    let errorReportBase64: string | null = null;
    if (errors.length) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Import Errors');
      ws.addRow(['Row Number', 'Field', 'Error Message']);
      ws.getRow(1).font = { bold: true };
      errors.forEach((e) => ws.addRow([e.rowNumber, e.field, e.message]));
      ws.columns = [{ width: 12 }, { width: 28 }, { width: 90 }];
      const buf = await buildXlsxBuffer(wb);
      errorReportBase64 = buf.toString('base64');
    }

    res.json({
      success: true,
      data: {
        processed,
        imported,
        failed,
        errorCount: errors.length,
        errorReportBase64,
      },
    });
  } catch (e: any) {
    console.error('importEmployeesExcel error:', e);
    res.status(500).json({ success: false, message: 'Import failed', error: e?.message });
  }
};

export const exportEmployeesExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Employees', { views: [{ state: 'frozen', ySplit: 1 }] });
    const labels = EMPLOYEE_IMPORT_SCHEMA.map((f) => `${f.label}${f.required ? ' *' : ''}`);
    ws.addRow(labels);
    ws.getRow(1).font = { bold: true };

    users.forEach((u) => {
      const row = EMPLOYEE_IMPORT_SCHEMA.map((f) => {
        const v: any = (u as any)[f.key];
        if (v === null || v === undefined) {
          // map special flattened fields
          if (f.key === 'phone') return u.phone || '';
          if (f.key === 'workEmail') return u.email || '';
          return '';
        }
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') return String(v);
        if (f.key === 'phoneNumbers') {
          try {
            const arr = JSON.parse(String(v));
            return Array.isArray(arr) ? arr.join(',') : String(v);
          } catch {
            return String(v);
          }
        }
        if (f.key === 'emailAddresses') {
          try {
            const arr = JSON.parse(String(v));
            return Array.isArray(arr) ? arr.join(',') : String(v);
          } catch {
            return String(v);
          }
        }
        return String(v);
      });
      ws.addRow(row);
    });

    EMPLOYEE_IMPORT_SCHEMA.forEach((f, idx) => {
      ws.getColumn(idx + 1).width = Math.max(16, Math.min(44, (f.label.length || 10) + 10));
    });

    const buffer = await buildXlsxBuffer(wb);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employees-export.xlsx"');
    res.send(buffer);
  } catch (e: any) {
    console.error('exportEmployeesExcel error:', e);
    res.status(500).json({ success: false, message: 'Export failed', error: e?.message });
  }
};

