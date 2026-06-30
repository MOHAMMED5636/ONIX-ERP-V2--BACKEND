import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import type { PayrollLine, PayrollRun, User } from '@prisma/client';
import { getMonthlySalarySheet, type MonthlySheetRow } from './salary-monthly-sheet.service';
import {
  type CompanyBranding,
  drawLetterheadFooter,
  drawLetterheadHeader,
  FOOTER_MAX_H,
  resolveCompanyBranding,
} from './leaveCertificate.service';
import { formatPayrollAmount, payrollCurrencyForEmployeeNo } from '../utils/payroll-currency';

const PAGE_MARGIN = 40;
const ROW_H = 18;
const HEADER_H = 20;

type TableCol = {
  key: string;
  label: string;
  x: number;
  w: number;
  align: 'left' | 'right' | 'center';
};

type TableLayout = {
  left: number;
  right: number;
  width: number;
  cols: TableCol[];
};

function buildTableLayout(pageWidth: number): TableLayout {
  const left = PAGE_MARGIN;
  const right = pageWidth - PAGE_MARGIN;
  const width = right - left;

  const idxW = Math.round(width * 0.04);
  const empNoW = Math.round(width * 0.1);
  const nameW = Math.round(width * 0.24);
  const jobW = Math.round(width * 0.22);
  const grossW = Math.round(width * 0.13);
  const dedW = Math.round(width * 0.12);
  const netW = width - idxW - empNoW - nameW - jobW - grossW - dedW;

  let x = left;
  const next = (w: number) => {
    const colX = x;
    x += w;
    return colX;
  };

  const cols: TableCol[] = [
    { key: 'idx', label: '#', x: next(idxW), w: idxW, align: 'center' },
    { key: 'empNo', label: 'Emp No', x: next(empNoW), w: empNoW, align: 'left' },
    { key: 'name', label: 'Employee', x: next(nameW), w: nameW, align: 'left' },
    { key: 'job', label: 'Job', x: next(jobW), w: jobW, align: 'left' },
    { key: 'gross', label: 'Gross', x: next(grossW), w: grossW, align: 'right' },
    { key: 'ded', label: 'Deductions', x: next(dedW), w: dedW, align: 'right' },
    { key: 'net', label: 'Net', x: next(netW), w: netW, align: 'right' },
  ];

  return { left, right, width, cols };
}

function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number, employeeNo: string): string {
  return formatPayrollAmount(n, employeeNo);
}

function monthLabel(month: number, year: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatPeriod(run: PayrollRun): string {
  const start = run.periodStart.toISOString().slice(0, 10);
  const end = run.periodEnd.toISOString().slice(0, 10);
  return `${start} — ${end}`;
}

export type RegisterRow = {
  index: number;
  employeeNo: string;
  name: string;
  job: string;
  gross: number;
  deductions: number;
  net: number;
};

export type PayrollRegisterPdfInput = {
  run: PayrollRun;
  rows: RegisterRow[];
  totals: {
    aed: { gross: number; deductions: number; net: number };
    usd: { gross: number; deductions: number; net: number };
  };
  branding: CompanyBranding;
};

function sheetGross(row: MonthlySheetRow): number {
  return toNum(row.salaryOfWorkingDays) + toNum(row.normalOtPay) + toNum(row.specialOtPay) + toNum(row.otherExpenses);
}

function sheetDeductions(row: MonthlySheetRow): number {
  return toNum(row.absenceDeduction) + toNum(row.lateDeduction) + toNum(row.otherDeductions);
}

function sheetNet(row: MonthlySheetRow): number {
  const paid = row.paidSalary ?? row.finalSalary;
  if (paid != null) return toNum(paid);
  return sheetGross(row) - sheetDeductions(row) + toNum(row.adjustments);
}

function lineToRegisterRow(
  line: PayrollLine & { employee: Pick<User, 'firstName' | 'lastName' | 'employeeId'> },
  sheetRow: MonthlySheetRow | undefined,
  index: number,
): RegisterRow {
  const name =
    sheetRow?.personName?.trim() ||
    [line.employee.firstName, line.employee.lastName].filter(Boolean).join(' ').trim() ||
    '—';
  const employeeNo =
    sheetRow?.employeeNo || line.snapshotEmployeeId || line.employee.employeeId || '—';
  const job = sheetRow?.jobName || line.snapshotDepartment || '—';

  if (sheetRow) {
    return {
      index,
      employeeNo: String(employeeNo),
      name,
      job: String(job),
      gross: sheetGross(sheetRow),
      deductions: sheetDeductions(sheetRow),
      net: sheetNet(sheetRow),
    };
  }

  return {
    index,
    employeeNo: String(employeeNo),
    name,
    job: String(job),
    gross: toNum(line.grossSalary),
    deductions: toNum(line.totalDeductions),
    net: toNum(line.netSalary),
  };
}

export async function loadPayrollRegisterPdfInput(runId: string): Promise<PayrollRegisterPdfInput | null> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  const lines = await prisma.payrollLine.findMany({
    where: { payrollRunId: runId },
    include: {
      employee: {
        select: { firstName: true, lastName: true, employeeId: true },
      },
    },
  });

  const sheet = await getMonthlySalarySheet({
    year: run.periodYear,
    month: run.periodMonth,
  });
  const rowByEmployee = new Map(sheet.rows.map((r) => [r.employeeUserId, r]));

  const registerRows = lines
    .map((line, i) => lineToRegisterRow(line, rowByEmployee.get(line.employeeId), i + 1))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((row, i) => ({ ...row, index: i + 1 }));

  const totals = registerRows.reduce(
    (acc, r) => {
      const bucket = payrollCurrencyForEmployeeNo(r.employeeNo) === 'USD' ? acc.usd : acc.aed;
      bucket.gross += r.gross;
      bucket.deductions += r.deductions;
      bucket.net += r.net;
      return acc;
    },
    {
      aed: { gross: 0, deductions: 0, net: 0 },
      usd: { gross: 0, deductions: 0, net: 0 },
    },
  );

  const roundTotals = (t: { gross: number; deductions: number; net: number }) => ({
    gross: Math.round(t.gross * 100) / 100,
    deductions: Math.round(t.deductions * 100) / 100,
    net: Math.round(t.net * 100) / 100,
  });

  const branding = await resolveCompanyBranding(null);

  return {
    run,
    rows: registerRows,
    totals: {
      aed: roundTotals(totals.aed),
      usd: roundTotals(totals.usd),
    },
    branding,
  };
}

function colByKey(layout: TableLayout, key: string): TableCol {
  const col = layout.cols.find((c) => c.key === key);
  if (!col) throw new Error(`Missing column: ${key}`);
  return col;
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  text: string,
  col: TableCol,
  y: number,
  opts?: { bold?: boolean; color?: string; size?: number },
) {
  doc
    .font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opts?.size ?? 7.5)
    .fillColor(opts?.color ?? '#111827')
    .text(text, col.x + 3, y, {
      width: col.w - 6,
      align: col.align,
      lineBreak: false,
      ellipsis: col.align === 'left',
    });
}

function drawTableHeader(doc: PDFKit.PDFDocument, layout: TableLayout, y: number): number {
  doc.rect(layout.left, y, layout.width, HEADER_H).fill('#312e81');
  for (const col of layout.cols) {
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#ffffff')
      .text(col.label, col.x + 3, y + 5, {
        width: col.w - 6,
        align: col.align,
        lineBreak: false,
      });
  }
  doc.font('Helvetica').fillColor('#111827');
  return y + HEADER_H + 2;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  layout: TableLayout,
  row: RegisterRow,
  y: number,
  shaded: boolean,
): number {
  if (shaded) {
    doc.rect(layout.left, y, layout.width, ROW_H).fill('#f3f4f6');
  }

  const padY = y + 4;
  drawCellText(doc, String(row.index), colByKey(layout, 'idx'), padY);
  drawCellText(doc, row.employeeNo, colByKey(layout, 'empNo'), padY);
  drawCellText(doc, row.name, colByKey(layout, 'name'), padY);
  drawCellText(doc, row.job, colByKey(layout, 'job'), padY);
  drawCellText(doc, money(row.gross, row.employeeNo), colByKey(layout, 'gross'), padY);
  drawCellText(doc, money(row.deductions, row.employeeNo), colByKey(layout, 'ded'), padY);
  drawCellText(doc, money(row.net, row.employeeNo), colByKey(layout, 'net'), padY, { bold: true });

  return y + ROW_H;
}

function drawContinuationHeader(doc: PDFKit.PDFDocument, run: PayrollRun, layout: TableLayout, y: number): number {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#312e81');
  doc.text(
    `Payroll Register — ${monthLabel(run.periodMonth, run.periodYear)} (continued)`,
    layout.left,
    y,
    { width: layout.width, lineBreak: false },
  );
  doc.font('Helvetica');
  return y + 18;
}

function footerReserve(branding: CompanyBranding): number {
  return branding.footerPath ? FOOTER_MAX_H + PAGE_MARGIN + 8 : PAGE_MARGIN + 20;
}

export function generatePayrollRegisterPdfBuffer(input: PayrollRegisterPdfInput): Promise<Buffer> {
  const { run, rows, totals, branding } = input;
  const bottomPad = footerReserve(branding);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let layout = buildTableLayout(doc.page.width);
    const pageBottom = () => doc.page.height - bottomPad;

    doc.y = drawLetterheadHeader(doc, branding);

    doc.fontSize(14).fillColor('#312e81').text('Payroll Register', layout.left, doc.y, {
      width: layout.width,
      align: 'center',
      lineBreak: false,
    });
    doc.y += 20;

    doc.fontSize(9).fillColor('#111827');
    doc.text(`Period: ${monthLabel(run.periodMonth, run.periodYear)}`, layout.left, doc.y, { lineBreak: false });
    doc.text(`Dates: ${formatPeriod(run)}`, layout.left + 200, doc.y, { lineBreak: false });
    doc.text(`Employees: ${rows.length}`, layout.left + 430, doc.y, { lineBreak: false });
    doc.text(`Status: ${run.status.replace(/_/g, ' ')}`, layout.left + 530, doc.y, { lineBreak: false });
    doc.y += 16;

    doc.fontSize(9).fillColor('#374151');
    doc.text(
      `Total net (AED): ${formatPayrollAmount(totals.aed.net, 'E-24-001')}`,
      layout.left,
      doc.y,
      { lineBreak: false },
    );
    doc.text(
      `Total net (USD): ${formatPayrollAmount(totals.usd.net, 'SY-26-01')}`,
      layout.left + 220,
      doc.y,
      { lineBreak: false },
    );
    doc.y += 16;

    let y = drawTableHeader(doc, layout, doc.y);

    for (let i = 0; i < rows.length; i += 1) {
      if (y + ROW_H > pageBottom()) {
        drawLetterheadFooter(doc, branding);
        doc.addPage({ layout: 'landscape', margin: PAGE_MARGIN });
        layout = buildTableLayout(doc.page.width);
        y = drawContinuationHeader(doc, run, layout, PAGE_MARGIN);
        y = drawTableHeader(doc, layout, y);
      }
      y = drawTableRow(doc, layout, rows[i], y, i % 2 === 1);
    }

    if (y + ROW_H + 8 > pageBottom()) {
      drawLetterheadFooter(doc, branding);
      doc.addPage({ layout: 'landscape', margin: PAGE_MARGIN });
      layout = buildTableLayout(doc.page.width);
      y = drawContinuationHeader(doc, run, layout, PAGE_MARGIN);
    }

    const totalsY = y + 4;
    doc.rect(layout.left, totalsY, layout.width, HEADER_H).fillAndStroke('#ecfdf5', '#10b981');
    drawCellText(doc, 'TOTALS (AED)', colByKey(layout, 'name'), totalsY + 4, { bold: true, color: '#065f46' });
    drawCellText(doc, formatPayrollAmount(totals.aed.gross, 'E-24-001'), colByKey(layout, 'gross'), totalsY + 4, { bold: true });
    drawCellText(doc, formatPayrollAmount(totals.aed.deductions, 'E-24-001'), colByKey(layout, 'ded'), totalsY + 4, { bold: true });
    drawCellText(doc, formatPayrollAmount(totals.aed.net, 'E-24-001'), colByKey(layout, 'net'), totalsY + 4, {
      bold: true,
      color: '#065f46',
    });

    if (totals.usd.net > 0 || totals.usd.gross > 0) {
      const usdTotalsY = totalsY + HEADER_H + 2;
      doc.rect(layout.left, usdTotalsY, layout.width, HEADER_H).fillAndStroke('#eff6ff', '#3b82f6');
      drawCellText(doc, 'TOTALS (USD)', colByKey(layout, 'name'), usdTotalsY + 4, { bold: true, color: '#1e40af' });
      drawCellText(doc, formatPayrollAmount(totals.usd.gross, 'SY-26-01'), colByKey(layout, 'gross'), usdTotalsY + 4, { bold: true });
      drawCellText(doc, formatPayrollAmount(totals.usd.deductions, 'SY-26-01'), colByKey(layout, 'ded'), usdTotalsY + 4, { bold: true });
      drawCellText(doc, formatPayrollAmount(totals.usd.net, 'SY-26-01'), colByKey(layout, 'net'), usdTotalsY + 4, {
        bold: true,
        color: '#1e40af',
      });
    }

    drawLetterheadFooter(doc, branding);
    doc.end();
  });
}
