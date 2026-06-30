export type AttendanceMonthlyExcelField = {
  key: string;
  label: string;
  required?: boolean;
  sample?: string;
  note?: string;
};

/** Employee list only — names and IDs for the selected month. */
export const ATTENDANCE_MONTHLY_NAMES_SCHEMA: AttendanceMonthlyExcelField[] = [
  { key: 'employeeId', label: 'Employee ID', required: true, sample: 'O-21-005' },
  { key: 'employeeName', label: 'Employee Name', sample: 'MUFAZZAL MOHAMED RASHEED' },
  { key: 'department', label: 'Department', sample: 'Engineering' },
  { key: 'company', label: 'Company', sample: 'ONIX PLUS BUILDING CONTRACTING L L C' },
  { key: 'periodStart', label: 'Period Start', sample: '2026-06-01', note: 'YYYY-MM-DD' },
  { key: 'periodEnd', label: 'Period End', sample: '2026-06-30', note: 'YYYY-MM-DD' },
];

/** One row per employee per day — fill check-in, check-out, status. */
export const ATTENDANCE_MONTHLY_ENTRY_SCHEMA: AttendanceMonthlyExcelField[] = [
  { key: 'employeeId', label: 'Employee ID', required: true, sample: 'O-21-005' },
  { key: 'employeeName', label: 'Employee Name', sample: 'MUFAZZAL MOHAMED RASHEED', note: 'Do not change on import' },
  { key: 'attendanceDate', label: 'Attendance Date', required: true, sample: '2026-06-01', note: 'YYYY-MM-DD' },
  { key: 'checkInTime', label: 'Check-in Time', sample: '08:00 AM', note: 'e.g. 08:01 AM' },
  { key: 'checkOutTime', label: 'Check-out Time', sample: '06:30 PM', note: 'e.g. 06:45 PM' },
  {
    key: 'status',
    label: 'Status',
    sample: 'PRESENT',
    note: 'PRESENT, LATE, ABSENT, ON_LEAVE, EARLY_DEPARTURE, VACATION, PUBLIC_HOLIDAY, OUT_OF_LOCATION',
  },
];

export type MonthlyExcelLayout = 'names' | 'entry';
