"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATTENDANCE_IMPORT_SCHEMA = void 0;
exports.ATTENDANCE_IMPORT_SCHEMA = [
    { key: 'attendanceDate', label: 'Attendance Date', required: true, sample: '2026-05-22', note: 'YYYY-MM-DD' },
    { key: 'employeeId', label: 'Employee ID', required: true, sample: 'O-21-005' },
    { key: 'employeeName', label: 'Employee Name', sample: 'MUFAZZAL MOHAMED RASHEED', note: 'Export only — not required on import' },
    { key: 'checkInTime', label: 'Check-in Time', sample: '07:54 AM', note: 'e.g. 08:01 AM or 08:01' },
    { key: 'checkOutTime', label: 'Check-out Time', sample: '06:45 PM', note: 'Optional until employee checks out' },
    { key: 'totalWorkingHours', label: 'Total Working Hours', sample: '9.5', note: 'Export only (calculated)' },
    { key: 'extraTime', label: 'Extra Time', sample: '5m', note: 'Export only — before 8:00 AM / after 6:30 PM' },
    { key: 'status', label: 'Status', sample: 'PRESENT', note: 'PRESENT, LATE, ABSENT, EARLY_DEPARTURE' },
];
