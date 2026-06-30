import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

export function buildXlsxBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return workbook.xlsx.writeBuffer().then((b) => Buffer.from(b as ArrayBuffer));
}

export function safeCellString(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Excel often stores dates as serial numbers when `raw: true` or in some exports.
 * Integer serials in ~20000–60000 map to ~1955–2038 (typical business dates).
 */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < 20000 || whole > 60000) return null;
  const epochMs = Date.UTC(1899, 11, 30) + whole * 86400000;
  const d = new Date(epochMs);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Prefer this when reading import rows so numeric date cells import correctly. */
export function importCellString(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    const whole = Math.floor(v);
    if (Number.isInteger(whole) && whole >= 20000 && whole <= 60000) {
      const iso = excelSerialToIsoDate(v);
      if (iso) return iso;
    }
    return String(v);
  }
  return String(v).trim();
}

/**
 * Excel sometimes leaves `!ref` smaller than the cells that exist; `sheet_to_json` then omits rows.
 * Recompute range from all populated cell addresses.
 */
export function expandSheetRangeToUsedGrid(sheet: XLSX.WorkSheet): void {
  const addrs = Object.keys(sheet).filter((k) => !k.startsWith('!'));
  if (!addrs.length) return;
  let minR = Infinity;
  let minC = Infinity;
  let maxR = 0;
  let maxC = 0;
  for (const addr of addrs) {
    if (!/^[A-Za-z]+[0-9]+$/.test(addr)) continue;
    const c = XLSX.utils.decode_cell(addr);
    if (c.r < minR) minR = c.r;
    if (c.c < minC) minC = c.c;
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  if (minR === Infinity) return;
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC },
  });
}

