import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import type { PayrollLine, PayrollRun, User } from '@prisma/client';
import {
  type CompanyBranding,
  drawCompanyStamp,
  drawLetterheadFooter,
  drawLetterheadHeader,
  resolveCompanyBranding,
} from './leaveCertificate.service';
import { formatPayrollAmount, payrollCurrencyForEmployeeNo, type PayrollCurrency } from '../utils/payroll-currency';

type Worksheet = Record<string, unknown>;

const PAGE_MARGIN = 40;

type PayslipFields = {
  name: string;
  empNo: string;
  job: string;
  monthName: string;
  year: number;
  issueDate: string;
  payableDays: number;
  presentDays: number;
  absentDays: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  totalGross: number;
  absenceDelayAmount: number;
  otherDeductionAmount: number;
  totalDeductions: number;
  netSalary: number;
  statusLabel: string;
  currency: PayrollCurrency;
};

function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number, employeeNo: string): string {
  return formatPayrollAmount(n, employeeNo);
}

function monthNameOnly(month: number): string {
  const d = new Date(Date.UTC(2000, month - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

function parseWorksheet(raw: unknown): Worksheet | null {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Worksheet;
  }
  return null;
}

export type PayslipPdfInput = {
  line: PayrollLine & {
    employee: Pick<User, 'id' | 'firstName' | 'lastName' | 'employeeId' | 'department' | 'jobTitle' | 'company'>;
    payrollRun: PayrollRun;
  };
  worksheet: Worksheet | null;
  branding: CompanyBranding;
};

export async function loadPayslipPdfInput(
  runId: string,
  employeeId: string,
): Promise<PayslipPdfInput | null> {
  const line = await prisma.payrollLine.findFirst({
    where: { payrollRunId: runId, employeeId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          department: true,
          jobTitle: true,
          company: true,
        },
      },
      payrollRun: true,
    },
  });

  if (!line) return null;

  const monthlyLine = await prisma.salaryMonthlyLine.findUnique({
    where: {
      year_month_employeeId: {
        year: line.payrollRun.periodYear,
        month: line.payrollRun.periodMonth,
        employeeId,
      },
    },
    select: { worksheetData: true, publishedAt: true },
  });

  const branding = await resolveCompanyBranding(line.employee.company);

  return {
    line,
    worksheet: parseWorksheet(monthlyLine?.worksheetData),
    branding,
  };
}

function buildPayslipFields(input: PayslipPdfInput): PayslipFields {
  const { line, worksheet: ws } = input;
  const run = line.payrollRun;
  const emp = line.employee;

  const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || 'Employee';
  const empNo =
    (typeof ws?.employeeNo === 'string' && ws.employeeNo) ||
    line.snapshotEmployeeId ||
    emp.employeeId ||
    '—';
  const job =
    (typeof ws?.jobName === 'string' && ws.jobName) ||
    line.snapshotDepartment ||
    emp.jobTitle ||
    emp.department ||
    '—';

  const contractBasic = ws ? toNum(ws.totalSalary) : toNum(line.snapshotBasicSalary);
  const normalOt = ws ? toNum(ws.normalOtPay) : 0;
  const specialOt = ws ? toNum(ws.specialOtPay) : 0;
  const otherExpenses = ws ? toNum(ws.otherExpenses) : 0;
  const otherAllowance = round2(normalOt + specialOt + otherExpenses);

  const salaryOfWorkingDays = ws ? toNum(ws.salaryOfWorkingDays) : contractBasic;
  const basicSalary = round2(salaryOfWorkingDays > 0 ? salaryOfWorkingDays : contractBasic);
  const totalGross = round2(
    ws
      ? basicSalary + otherAllowance
      : toNum(line.grossSalary),
  );

  const absenceDed = ws ? toNum(ws.absenceDeduction) : toNum(line.absenceDeduction);
  const lateDed = ws ? toNum(ws.lateDeduction) : toNum(line.lateDeduction);
  const otherDed = ws ? toNum(ws.otherDeductions) : 0;
  const absenceDelayAmount = round2(absenceDed + lateDed);
  const totalDeductions = round2(absenceDelayAmount + otherDed);

  const netSalary = round2(
    ws && (ws.paidSalary != null || ws.finalSalary != null)
      ? toNum(ws.paidSalary ?? ws.finalSalary)
      : toNum(line.netSalary),
  );

  const payableDays = ws ? toNum(ws.workingDays) || 30 : 30;
  const presentDays = ws ? toNum(ws.realWorkingDays) : line.totalWorkingDays;
  const absentDays = ws ? toNum(ws.unexcusedAbsenceDays) : line.totalAbsentDays;

  const periodEnd = run.periodEnd instanceof Date ? run.periodEnd : new Date(run.periodEnd);
  const issueDate = periodEnd.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return {
    name,
    empNo: String(empNo),
    job: String(job),
    monthName: monthNameOnly(run.periodMonth),
    year: run.periodYear,
    issueDate,
    payableDays,
    presentDays,
    absentDays,
    basicSalary,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowance,
    totalGross: totalGross > 0 ? totalGross : round2(basicSalary + otherAllowance),
    absenceDelayAmount,
    otherDeductionAmount: otherDed,
    totalDeductions,
    netSalary,
    statusLabel: run.status.replace(/_/g, ' '),
    currency: payrollCurrencyForEmployeeNo(String(empNo)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type TableRow = [string, string, string, string];

function drawBorderedTable(
  doc: PDFKit.PDFDocument,
  left: number,
  top: number,
  width: number,
  headers: string[],
  rows: TableRow[],
  opts?: { headerFill?: string; boldLastRow?: boolean },
): number {
  const colWidths = [width * 0.36, width * 0.18, width * 0.18, width * 0.28];
  const rowH = 20;
  const headerH = 22;
  let y = top;

  doc.rect(left, y, width, headerH).fillAndStroke(opts?.headerFill ?? '#f8fafc', '#94a3b8');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b');
  let x = left;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, y + 6, { width: colWidths[i] - 8, lineBreak: false });
    x += colWidths[i];
  });
  y += headerH;

  rows.forEach((row, rowIdx) => {
    const isLast = rowIdx === rows.length - 1;
    const bold = opts?.boldLastRow && isLast;
    if (rowIdx % 2 === 1) {
      doc.rect(left, y, width, rowH).fill('#fafafa');
    }
    doc.rect(left, y, width, rowH).stroke('#cbd5e1');
    x = left;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#111827');
    row.forEach((cell, i) => {
      doc.text(cell, x + 4, y + 6, {
        width: colWidths[i] - 8,
        align: i >= 1 ? 'center' : 'left',
        lineBreak: false,
      });
      x += colWidths[i];
    });
    y += rowH;
  });

  return y;
}

function infoLine(doc: PDFKit.PDFDocument, labelX: number, valueX: number, y: number, label: string, value: string) {
  doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`${label}:`, labelX, y, { lineBreak: false });
  doc.font('Helvetica-Bold').fillColor('#0f172a').text(value, valueX, y, { width: 280, lineBreak: false });
}

function renderOnixPayslip(doc: PDFKit.PDFDocument, branding: CompanyBranding, fields: PayslipFields) {
  const pageW = doc.page.width;
  const contentW = pageW - PAGE_MARGIN * 2;
  const left = PAGE_MARGIN;

  doc.y = drawLetterheadHeader(doc, branding);

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a');
  doc.text('Payslip', left, doc.y + 8, { width: contentW, align: 'center', lineBreak: false });
  let y = doc.y + 36;

  const labelX = left + 8;
  const valueX = left + 130;
  infoLine(doc, labelX, valueX, y, 'Employee Name', fields.name);
  y += 16;
  infoLine(doc, labelX, valueX, y, 'Job Title', fields.job);
  y += 16;
  infoLine(doc, labelX, valueX, y, 'Employee No', fields.empNo);
  y += 16;
  infoLine(doc, labelX, valueX, y, 'Month', fields.monthName);
  y += 16;
  infoLine(doc, labelX, valueX, y, 'Year', String(fields.year));
  y += 16;
  infoLine(doc, labelX, valueX, y, 'Issue Date', fields.issueDate);
  y += 22;

  const pd = String(fields.payableDays);
  const pr = String(fields.presentDays);
  const ad = String(fields.absentDays);

  y = drawBorderedTable(
    doc,
    left,
    y,
    contentW,
    ['Component', 'Payable Days', 'Present Days', 'Amount'],
    [
      ['Basic Salary', pd, pr, money(fields.basicSalary, fields.empNo)],
      ['Housing Allowance', pd, pr, money(fields.housingAllowance, fields.empNo)],
      ['Transportation Allowance', pd, pr, money(fields.transportAllowance, fields.empNo)],
      ['Other Allowance', pd, pr, money(fields.otherAllowance, fields.empNo)],
      ['Total Gross Salary', pd, pr, money(fields.totalGross, fields.empNo)],
    ],
    { boldLastRow: true },
  );

  y += 14;

  y = drawBorderedTable(
    doc,
    left,
    y,
    contentW,
    ['Component', 'Absent Days', 'Other Days', 'Amount'],
    [
      ['Absence/Delay', ad, '0', money(fields.absenceDelayAmount, fields.empNo)],
      ['Other Deductions', '0', '0', money(fields.otherDeductionAmount, fields.empNo)],
      ['Total Deductions', '', '', money(fields.totalDeductions, fields.empNo)],
    ],
    { boldLastRow: true },
  );

  y += 14;

  y = drawBorderedTable(
    doc,
    left,
    y,
    contentW,
    ['Component', '', '', 'Amount'],
    [['Net Salary', '', '', money(fields.netSalary, fields.empNo)]],
    { headerFill: '#ecfdf5', boldLastRow: true },
  );

  y += 16;
  doc.font('Helvetica').fontSize(7).fillColor('#64748b');
  doc.text(
    'This payslip is issued in accordance with company payroll records. Any additional payments or adjustments approved by HR are reflected in the Amount columns above.',
    left,
    y,
    { width: contentW, align: 'justify' },
  );

  drawLetterheadFooter(doc, branding);
  drawCompanyStamp(doc, branding, { pageMargin: PAGE_MARGIN, align: 'left' });
}

export function generatePayslipPdfBuffer(input: PayslipPdfInput): Promise<Buffer> {
  const { branding } = input;
  const fields = buildPayslipFields(input);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderOnixPayslip(doc, branding, fields);
    doc.end();
  });
}
