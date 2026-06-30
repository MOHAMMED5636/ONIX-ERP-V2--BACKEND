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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importAttendanceExcel = exports.exportAttendanceExcel = exports.downloadAttendanceTemplate = void 0;
const database_1 = __importDefault(require("../config/database"));
const exceljs_1 = __importDefault(require("exceljs"));
const XLSX = __importStar(require("xlsx"));
const client_1 = require("@prisma/client");
const attendanceImportSchema_1 = require("../config/attendanceImportSchema");
const excel_1 = require("../utils/excel");
const attendance_admin_rows_1 = require("../utils/attendance-admin-rows");
const YMD = /^\d{4}-\d{2}-\d{2}$/;
async function buildWorkbookFromRows(rows, sheetName) {
    const wb = new exceljs_1.default.Workbook();
    wb.creator = 'ONIX ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 2 }] });
    const instr = wb.addWorksheet('Instructions');
    const labels = attendanceImportSchema_1.ATTENDANCE_IMPORT_SCHEMA.map((f) => `${f.label}${f.required ? ' *' : ''}`);
    const keys = attendanceImportSchema_1.ATTENDANCE_IMPORT_SCHEMA.map((f) => f.key);
    ws.addRow(labels);
    ws.addRow(keys);
    ws.getRow(2).hidden = true;
    for (const row of rows) {
        ws.addRow(keys.map((k) => row[k] ?? ''));
    }
    ws.getRow(1).font = { bold: true };
    attendanceImportSchema_1.ATTENDANCE_IMPORT_SCHEMA.forEach((f, idx) => {
        ws.getColumn(idx + 1).width = Math.max(14, Math.min(32, (f.label.length || 10) + 6));
    });
    instr.addRow(['Attendance Import / Export']);
    instr.getRow(1).font = { bold: true, size: 14 };
    instr.addRow([]);
    instr.addRow(['1) Row 1 = headers, row 2 = hidden keys. Data from row 3.']);
    instr.addRow(['2) Office hours for Extra Time: 8:00 AM – 6:30 PM on the attendance date.']);
    instr.addRow(['3) Import updates check-in / check-out for existing employees by Employee ID + date.']);
    instr.addRow(['4) Times use office local timezone (same as the Attendance List screen).']);
    instr.columns = [{ width: 90 }];
    return wb;
}
function mapAttendanceStatus(v) {
    const s = (v || '').trim().toUpperCase().replace(/\s+/g, '_');
    const map = {
        PRESENT: client_1.AttendanceStatus.PRESENT,
        LATE: client_1.AttendanceStatus.LATE,
        ABSENT: client_1.AttendanceStatus.ABSENT,
        EARLY_DEPARTURE: client_1.AttendanceStatus.EARLY_DEPARTURE,
    };
    return map[s];
}
const downloadAttendanceTemplate = async (req, res) => {
    try {
        const sample = attendanceImportSchema_1.ATTENDANCE_IMPORT_SCHEMA.map((f) => f.sample || '');
        const wb = await buildWorkbookFromRows([Object.fromEntries(attendanceImportSchema_1.ATTENDANCE_IMPORT_SCHEMA.map((f, i) => [f.key, sample[i] || '']))], 'Attendance');
        const buffer = await (0, excel_1.buildXlsxBuffer)(wb);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="attendance-import-template.xlsx"');
        res.send(buffer);
    }
    catch (e) {
        console.error('downloadAttendanceTemplate error:', e);
        res.status(500).json({ success: false, message: 'Failed to generate template', error: e?.message });
    }
};
exports.downloadAttendanceTemplate = downloadAttendanceTemplate;
const exportAttendanceExcel = async (req, res) => {
    try {
        const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
        const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
        const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
        const adminRows = await (0, attendance_admin_rows_1.fetchAdminAttendanceRows)({
            date: date && YMD.test(date) ? date : undefined,
            from: from && YMD.test(from) ? from : undefined,
            to: to && YMD.test(to) ? to : undefined,
        });
        const rows = adminRows.map((r) => (0, attendance_admin_rows_1.adminRowToExportCells)(r));
        const wb = await buildWorkbookFromRows(rows, 'Attendance');
        const buffer = await (0, excel_1.buildXlsxBuffer)(wb);
        const suffix = date && YMD.test(date)
            ? date
            : from && to
                ? `${from}_to_${to}`
                : new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="attendance-export-${suffix}.xlsx"`);
        res.send(buffer);
    }
    catch (e) {
        console.error('exportAttendanceExcel error:', e);
        res.status(500).json({ success: false, message: 'Failed to export attendance', error: e?.message });
    }
};
exports.exportAttendanceExcel = exportAttendanceExcel;
const importAttendanceExcel = async (req, res) => {
    try {
        const file = req.file;
        if (!file?.buffer) {
            res.status(400).json({ success: false, message: 'No file uploaded' });
            return;
        }
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets['Attendance'] || workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) {
            res.status(400).json({ success: false, message: 'Invalid Excel file (no sheets)' });
            return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: false,
            defval: '',
        });
        if (!rows.length || rows.length < 2) {
            res.status(400).json({ success: false, message: 'File is empty' });
            return;
        }
        const headerKeys = (rows[1] || []).map((x) => (0, excel_1.safeCellString)(x));
        const expectedKeys = attendanceImportSchema_1.ATTENDANCE_IMPORT_SCHEMA.map((f) => f.key);
        if (headerKeys.join('|') !== expectedKeys.join('|')) {
            res.status(400).json({
                success: false,
                message: 'Column headers do not match the attendance template. Download a fresh template and try again.',
            });
            return;
        }
        const dataRows = rows.slice(2);
        const errors = [];
        let processed = 0;
        let updated = 0;
        let failed = 0;
        for (let i = 0; i < dataRows.length; i++) {
            const rowNumber = i + 3;
            const cells = dataRows[i] || [];
            const row = {};
            expectedKeys.forEach((key, idx) => {
                row[key] = (0, excel_1.importCellString)(cells[idx]);
            });
            const ymd = row.attendanceDate.trim();
            const empId = row.employeeId.trim();
            if (!ymd && !empId && cells.every((c) => !(0, excel_1.importCellString)(c)))
                continue;
            processed += 1;
            if (!ymd || !YMD.test(ymd)) {
                errors.push({ rowNumber, field: 'attendanceDate', message: 'Valid date YYYY-MM-DD required' });
                failed += 1;
                continue;
            }
            if (!empId) {
                errors.push({ rowNumber, field: 'employeeId', message: 'Employee ID is required' });
                failed += 1;
                continue;
            }
            const user = await database_1.default.user.findFirst({
                where: { employeeId: { equals: empId, mode: 'insensitive' } },
                select: { id: true, company: true },
            });
            if (!user) {
                errors.push({ rowNumber, field: 'employeeId', message: `Employee not found: ${empId}` });
                failed += 1;
                continue;
            }
            let companyId = null;
            if (user.company) {
                const co = await database_1.default.company.findFirst({
                    where: { name: user.company },
                    select: { id: true },
                });
                companyId = co?.id ?? null;
            }
            if (!companyId) {
                const fallback = await database_1.default.company.findFirst({ select: { id: true } });
                companyId = fallback?.id ?? null;
            }
            const attDate = (0, attendance_admin_rows_1.dateFromYyyyMmDd)(ymd);
            const checkInParsed = (0, attendance_admin_rows_1.parseTimeOnCalendarDay)(ymd, row.checkInTime);
            const checkOutParsed = (0, attendance_admin_rows_1.parseTimeOnCalendarDay)(ymd, row.checkOutTime);
            const status = mapAttendanceStatus(row.status) ?? client_1.AttendanceStatus.PRESENT;
            if (!checkInParsed && !checkOutParsed) {
                errors.push({
                    rowNumber,
                    field: 'checkInTime',
                    message: 'Provide at least check-in or check-out time',
                });
                failed += 1;
                continue;
            }
            if (checkInParsed && checkOutParsed && checkOutParsed.getTime() <= checkInParsed.getTime()) {
                errors.push({
                    rowNumber,
                    field: 'checkOutTime',
                    message: 'Check-out must be after check-in',
                });
                failed += 1;
                continue;
            }
            try {
                let rowUpdated = 0;
                if (checkInParsed) {
                    await database_1.default.attendance.upsert({
                        where: {
                            userId_date_type: {
                                userId: user.id,
                                date: attDate,
                                type: 'CHECK_IN',
                            },
                        },
                        create: {
                            userId: user.id,
                            companyId,
                            type: 'CHECK_IN',
                            date: attDate,
                            checkInTime: checkInParsed,
                            status,
                        },
                        update: {
                            checkInTime: checkInParsed,
                            status,
                        },
                    });
                    rowUpdated += 1;
                }
                if (checkOutParsed) {
                    await database_1.default.attendance.upsert({
                        where: {
                            userId_date_type: {
                                userId: user.id,
                                date: attDate,
                                type: 'CHECK_OUT',
                            },
                        },
                        create: {
                            userId: user.id,
                            companyId,
                            type: 'CHECK_OUT',
                            date: attDate,
                            checkOutTime: checkOutParsed,
                            status,
                        },
                        update: {
                            checkOutTime: checkOutParsed,
                            status,
                        },
                    });
                    rowUpdated += 1;
                }
                if (rowUpdated > 0)
                    updated += 1;
            }
            catch (err) {
                errors.push({ rowNumber, field: 'row', message: err?.message || 'Save failed' });
                failed += 1;
            }
        }
        let errorReportBase64;
        if (errors.length) {
            const errWb = new exceljs_1.default.Workbook();
            const errWs = errWb.addWorksheet('Import Errors');
            errWs.addRow(['Row', 'Field', 'Message']);
            errors.forEach((e) => errWs.addRow([e.rowNumber, e.field, e.message]));
            errorReportBase64 = (await (0, excel_1.buildXlsxBuffer)(errWb)).toString('base64');
        }
        res.json({
            success: true,
            data: { processed, updated, failed, errorCount: errors.length, errorReportBase64 },
        });
    }
    catch (e) {
        console.error('importAttendanceExcel error:', e);
        res.status(500).json({ success: false, message: 'Import failed', error: e?.message });
    }
};
exports.importAttendanceExcel = importAttendanceExcel;
