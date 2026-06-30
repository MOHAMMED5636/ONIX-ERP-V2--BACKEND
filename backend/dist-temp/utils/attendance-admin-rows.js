"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dateFromYyyyMmDd = dateFromYyyyMmDd;
exports.computeExtraTimeMinutes = computeExtraTimeMinutes;
exports.formatExtraTimeDisplay = formatExtraTimeDisplay;
exports.fetchAdminAttendanceRows = fetchAdminAttendanceRows;
exports.adminRowToExportCells = adminRowToExportCells;
exports.parseTimeOnCalendarDay = parseTimeOnCalendarDay;
const database_1 = __importDefault(require("../config/database"));
const YMD = /^\d{4}-\d{2}-\d{2}$/;
function dateFromYyyyMmDd(ymd) {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}
const OFFICE_START_HOUR = 8;
const OFFICE_START_MINUTE = 0;
const OFFICE_END_HOUR = 18;
const OFFICE_END_MINUTE = 30;
/** Extra minutes before 8:00 and after 18:30 on the calendar day (local TZ). */
function computeExtraTimeMinutes(checkInIso, checkOutIso, ymd) {
    const parts = ymd.split('-').map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n)))
        return null;
    const [y, m, d] = parts;
    const officeStart = new Date(y, m - 1, d, OFFICE_START_HOUR, OFFICE_START_MINUTE, 0, 0);
    const officeEnd = new Date(y, m - 1, d, OFFICE_END_HOUR, OFFICE_END_MINUTE, 0, 0);
    const ci = checkInIso ? new Date(checkInIso) : null;
    const co = checkOutIso ? new Date(checkOutIso) : null;
    let extraMs = 0;
    if (ci && !Number.isNaN(ci.getTime()) && ci < officeStart) {
        extraMs += officeStart.getTime() - ci.getTime();
    }
    if (co && !Number.isNaN(co.getTime()) && co > officeEnd) {
        extraMs += co.getTime() - officeEnd.getTime();
    }
    return extraMs / 60000;
}
function formatExtraTimeDisplay(minutes) {
    if (minutes == null || minutes <= 0)
        return '';
    const total = Math.round(minutes);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0)
        return `${h}h ${m}m`;
    if (h > 0)
        return `${h}h`;
    return `${m}m`;
}
function formatTimeExport(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
async function fetchAdminAttendanceRows(filters) {
    const where = {};
    if (filters.date && YMD.test(filters.date)) {
        where.date = dateFromYyyyMmDd(filters.date);
    }
    else if (filters.from || filters.to) {
        const range = {};
        if (filters.from && YMD.test(filters.from))
            range.gte = dateFromYyyyMmDd(filters.from);
        if (filters.to && YMD.test(filters.to))
            range.lte = dateFromYyyyMmDd(filters.to);
        if (Object.keys(range).length)
            where.date = range;
    }
    const raw = await database_1.default.attendance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { userId: 'asc' }],
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    employeeId: true,
                },
            },
        },
    });
    const byUserDate = {};
    for (const row of raw) {
        const key = `${row.userId}_${row.date.toISOString().slice(0, 10)}`;
        if (!byUserDate[key])
            byUserDate[key] = { checkIn: null, checkOut: null };
        if (row.type === 'CHECK_IN')
            byUserDate[key].checkIn = row;
        if (row.type === 'CHECK_OUT')
            byUserDate[key].checkOut = row;
    }
    return Object.entries(byUserDate)
        .map(([, { checkIn, checkOut }]) => {
        const rec = checkIn || checkOut;
        if (!rec)
            return null;
        const user = rec.user;
        const checkInTime = checkIn?.checkInTime ?? null;
        const checkOutTime = checkOut?.checkOutTime ?? null;
        let totalWorkingHours = null;
        if (checkInTime && checkOutTime) {
            const durationMs = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
            totalWorkingHours = Math.round((Math.max(0, durationMs) / (1000 * 60 * 60)) * 100) / 100;
        }
        const ymd = rec.date.toISOString().slice(0, 10);
        const extraTimeMinutes = computeExtraTimeMinutes(checkInTime, checkOutTime, ymd);
        return {
            employeeName: user
                ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
                : '—',
            employeeId: user?.employeeId ?? '—',
            userId: user?.id ?? '',
            checkInTime: checkInTime ? new Date(checkInTime).toISOString() : null,
            checkOutTime: checkOutTime ? new Date(checkOutTime).toISOString() : null,
            totalWorkingHours,
            attendanceDate: ymd,
            extraTimeMinutes,
        };
    })
        .filter((r) => r != null);
}
function adminRowToExportCells(row) {
    return {
        attendanceDate: row.attendanceDate,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        checkInTime: formatTimeExport(row.checkInTime),
        checkOutTime: formatTimeExport(row.checkOutTime),
        totalWorkingHours: row.totalWorkingHours != null ? String(row.totalWorkingHours) : '',
        extraTime: formatExtraTimeDisplay(row.extraTimeMinutes),
        status: 'PRESENT',
    };
}
function normalizeTimeInput(timeStr) {
    return (timeStr || '')
        .trim()
        .replace(/\u202f|\u00a0/g, ' ')
        .replace(/\./g, ':')
        .replace(/\s+/g, ' ');
}
/** Parse HH:MM AM/PM (or 24h) on calendar day in local TZ. */
function parseTimeOnCalendarDay(ymd, timeStr) {
    const t = normalizeTimeInput(timeStr);
    if (!t)
        return null;
    const isoTry = new Date(t);
    if (!Number.isNaN(isoTry.getTime()) && t.includes('T'))
        return isoTry;
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d)
        return null;
    const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(A\.?M\.?|P\.?M\.?)$/i);
    if (m12) {
        let h = parseInt(m12[1], 10);
        const min = parseInt(m12[2], 10);
        const ap = m12[3].replace(/\./g, '').toUpperCase();
        if (ap.startsWith('P') && h !== 12)
            h += 12;
        if (ap.startsWith('A') && h === 12)
            h = 0;
        return new Date(y, m - 1, d, h, min, 0, 0);
    }
    const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
    if (m24) {
        return new Date(y, m - 1, d, parseInt(m24[1], 10), parseInt(m24[2], 10), 0, 0);
    }
    return null;
}
