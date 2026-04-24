import ExcelJS from 'exceljs';

export function buildXlsxBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return workbook.xlsx.writeBuffer().then((b) => Buffer.from(b as ArrayBuffer));
}

export function safeCellString(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

