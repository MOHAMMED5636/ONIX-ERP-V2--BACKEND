"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildXlsxBuffer = buildXlsxBuffer;
exports.safeCellString = safeCellString;
exports.excelSerialToIsoDate = excelSerialToIsoDate;
exports.importCellString = importCellString;
exports.expandSheetRangeToUsedGrid = expandSheetRangeToUsedGrid;
const XLSX = __importStar(require("xlsx"));
function buildXlsxBuffer(workbook) {
    return workbook.xlsx.writeBuffer().then((b) => Buffer.from(b));
}
function safeCellString(v) {
    if (v === null || v === undefined)
        return '';
    return String(v).trim();
}
/**
 * Excel often stores dates as serial numbers when `raw: true` or in some exports.
 * Integer serials in ~20000–60000 map to ~1955–2038 (typical business dates).
 */
function excelSerialToIsoDate(serial) {
    if (!Number.isFinite(serial))
        return null;
    const whole = Math.floor(serial);
    if (whole < 20000 || whole > 60000)
        return null;
    const epochMs = Date.UTC(1899, 11, 30) + whole * 86400000;
    const d = new Date(epochMs);
    if (isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 10);
}
/** Prefer this when reading import rows so numeric date cells import correctly. */
function importCellString(v) {
    if (v === null || v === undefined)
        return '';
    if (typeof v === 'number' && Number.isFinite(v)) {
        const whole = Math.floor(v);
        if (Number.isInteger(whole) && whole >= 20000 && whole <= 60000) {
            const iso = excelSerialToIsoDate(v);
            if (iso)
                return iso;
        }
        return String(v);
    }
    return String(v).trim();
}
/**
 * Excel sometimes leaves `!ref` smaller than the cells that exist; `sheet_to_json` then omits rows.
 * Recompute range from all populated cell addresses.
 */
function expandSheetRangeToUsedGrid(sheet) {
    const addrs = Object.keys(sheet).filter((k) => !k.startsWith('!'));
    if (!addrs.length)
        return;
    let minR = Infinity;
    let minC = Infinity;
    let maxR = 0;
    let maxC = 0;
    for (const addr of addrs) {
        if (!/^[A-Za-z]+[0-9]+$/.test(addr))
            continue;
        const c = XLSX.utils.decode_cell(addr);
        if (c.r < minR)
            minR = c.r;
        if (c.c < minC)
            minC = c.c;
        if (c.r > maxR)
            maxR = c.r;
        if (c.c > maxC)
            maxC = c.c;
    }
    if (minR === Infinity)
        return;
    sheet['!ref'] = XLSX.utils.encode_range({
        s: { r: minR, c: minC },
        e: { r: maxR, c: maxC },
    });
}
