import ExcelJS from 'exceljs';
import { buildXlsxBuffer } from '../utils/excel';
import { ExpiryRecord, ExpiryStatusLabel } from './documentExpiry.service';

const STATUS_LABELS: Record<ExpiryStatusLabel, string> = {
  ok: 'Valid (>60 days)',
  warning: '30–60 days',
  attention: '7–29 days',
  urgent: 'Less than 7 days',
  expired: 'Expired',
};

const FILL_GREEN: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC6EFCE' },
};

const FILL_RED: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFC7CE' },
};

function formatExportDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB');
}

function formatDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d ago`;
  if (daysLeft === 0) return 'Today';
  return `${daysLeft} days`;
}

/** Green = valid; red = expiring soon or already expired. */
function isValidNotExpiringSoon(record: ExpiryRecord): boolean {
  return record.status === 'ok' || record.statusColor === 'green';
}

function applyExpiryRowStyle(row: ExcelJS.Row, record: ExpiryRecord): void {
  const fill = isValidNotExpiringSoon(record) ? FILL_GREEN : FILL_RED;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill;
  });
}

function addLegendAndHeaders(
  ws: ExcelJS.Worksheet,
  headers: string[],
  columnWidths: number[],
): void {
  ws.mergeCells(1, 1, 1, headers.length);
  const legend = ws.getCell(1, 1);
  legend.value =
    'Green = valid (not expiring soon)  ·  Red = expiring soon or already expired';
  legend.font = { italic: true, size: 10 };
  legend.alignment = { vertical: 'middle' };

  ws.addRow(headers);
  const headerRow = ws.getRow(2);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };

  headers.forEach((_, idx) => {
    ws.getColumn(idx + 1).width = columnWidths[idx] ?? 18;
  });

  ws.views = [{ state: 'frozen', ySplit: 2 }];
}

function addEmployeeSheet(ws: ExcelJS.Worksheet, rows: ExpiryRecord[]): void {
  const headers = ['Employee', 'Company', 'Branch', 'Document', 'Expiry Date', 'Days Left', 'Status'];
  addLegendAndHeaders(ws, headers, [28, 32, 18, 24, 14, 12, 18]);

  for (const r of rows) {
    const row = ws.addRow([
      r.employeeName || r.entityLabel || '',
      r.companyName || '',
      r.branchName || '',
      r.documentType,
      formatExportDate(r.expiresAt),
      formatDaysLeft(r.daysLeft),
      STATUS_LABELS[r.status] || r.status,
    ]);
    applyExpiryRowStyle(row, r);
  }
}

function addCompanySheet(ws: ExcelJS.Worksheet, rows: ExpiryRecord[]): void {
  const headers = ['Company', 'Branch', 'Document', 'Expiry Date', 'Days Left', 'Status'];
  addLegendAndHeaders(ws, headers, [32, 18, 28, 14, 12, 18]);

  for (const r of rows) {
    const row = ws.addRow([
      r.companyName || r.entityLabel || '',
      r.branchName || '',
      r.documentType,
      formatExportDate(r.expiresAt),
      formatDaysLeft(r.daysLeft),
      STATUS_LABELS[r.status] || r.status,
    ]);
    applyExpiryRowStyle(row, r);
  }
}

function addProjectSheet(ws: ExcelJS.Worksheet, rows: ExpiryRecord[]): void {
  const headers = ['Project', 'Reference', 'Document', 'Expiry Date', 'Days Left', 'Status'];
  addLegendAndHeaders(ws, headers, [30, 22, 26, 14, 12, 18]);

  for (const r of rows) {
    const row = ws.addRow([
      r.projectName || r.entityLabel || '',
      r.referenceCode || '',
      r.documentType,
      formatExportDate(r.expiresAt),
      formatDaysLeft(r.daysLeft),
      STATUS_LABELS[r.status] || r.status,
    ]);
    applyExpiryRowStyle(row, r);
  }
}

export async function buildExpiryReportExcelBuffer(data: {
  employees: ExpiryRecord[];
  companies: ExpiryRecord[];
  projectDocuments: ExpiryRecord[];
  includeCompanySheets: boolean;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ONIX ERP';
  wb.created = new Date();

  if (data.employees.length) {
    addEmployeeSheet(wb.addWorksheet('Employee Expiry'), data.employees);
  }

  if (data.includeCompanySheets && data.companies.length) {
    addCompanySheet(wb.addWorksheet('Company Expiry'), data.companies);
  }

  if (data.projectDocuments.length) {
    addProjectSheet(wb.addWorksheet('Project Attachments'), data.projectDocuments);
  }

  if (!wb.worksheets.length) {
    const ws = wb.addWorksheet('Document Expiry');
    addLegendAndHeaders(ws, ['Message'], [60]);
    ws.addRow(['No expiry records match the current filters.']);
  }

  return buildXlsxBuffer(wb);
}
