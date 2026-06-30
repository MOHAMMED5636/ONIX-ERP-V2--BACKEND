import prisma from '../config/database';
import { AttendanceStatus, Prisma, UserRole } from '@prisma/client';
import { ATTENDANCE_EXEMPT_ROLES } from '../services/faceAttendance.service';
import { buildCompanyScopeAliases } from './company-name-aliases';
import {
  computeExtraTimeMinutes,
  dateFromYyyyMmDd,
  formatExtraTimeDisplay,
  parseTimeOnCalendarDay,
} from './attendance-admin-rows';
import {
  buildUaePublicHolidayMap,
  getUaePublicHolidayName,
  getUaePublicHolidaysInRange,
  type UaePublicHoliday,
} from './uae-public-holidays';
import {
  computeWorkingHoursFromDates,
  deriveAttendanceStatus,
  deriveAttendanceStatusFromTimeStrings,
  isStatusOnlyAttendanceStatus,
} from './attendance-status.util';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function isValidAttendanceYmd(ymd: string): boolean {
  return YMD.test(ymd.trim());
}

export function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

export function monthPeriodFromYearMonth(year: number, month: number): {
  year: number;
  month: number;
  monthLabel: string;
  startDate: string;
  endDate: string;
  daysInMonth: number;
} {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    year,
    month,
    monthLabel: MONTH_LABELS[month - 1] ?? String(month),
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
}

/** Local calendar today as YYYY-MM-DD (manual entry uses local dates). */
export function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isFutureYearMonth(year: number, month: number): boolean {
  const d = new Date();
  const cy = d.getFullYear();
  const cm = d.getMonth() + 1;
  return year > cy || (year === cy && month > cm);
}

/** Cap period end to today so daily rows / summaries exclude future dates. */
export function capManualEntryPeriodToToday(
  period: ReturnType<typeof monthPeriodFromYearMonth>,
): ReturnType<typeof monthPeriodFromYearMonth> {
  const today = localTodayYmd();
  if (period.endDate <= today) return period;
  if (period.startDate > today) {
    return { ...period, endDate: period.startDate, daysInMonth: 0 };
  }
  const dates = enumerateDatesInRange(period.startDate, today);
  return {
    ...period,
    endDate: today,
    daysInMonth: dates.length,
  };
}

function enumerateDatesInRange(startYmd: string, endYmd: string): string[] {
  const [sy, sm, sd] = startYmd.split('-').map((x) => parseInt(x, 10));
  const [ey, em, ed] = endYmd.split('-').map((x) => parseInt(x, 10));
  const dates: string[] = [];
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function mapAttendanceStatusLabel(v: unknown): AttendanceStatus | undefined {
  const s = String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const map: Record<string, AttendanceStatus> = {
    PRESENT: AttendanceStatus.PRESENT,
    LATE: AttendanceStatus.LATE,
    ABSENT: AttendanceStatus.ABSENT,
    EARLY_DEPARTURE: AttendanceStatus.EARLY_DEPARTURE,
    ON_LEAVE: AttendanceStatus.ON_LEAVE,
    VACATION: AttendanceStatus.VACATION,
    PUBLIC_HOLIDAY: AttendanceStatus.PUBLIC_HOLIDAY,
    OUT_OF_LOCATION: AttendanceStatus.OUT_OF_LOCATION,
  };
  return map[s];
}

export async function resolveCompanyIdForUser(user: {
  company: string | null;
}): Promise<string | null> {
  if (user.company) {
    const co = await prisma.company.findFirst({
      where: { name: user.company },
      select: { id: true },
    });
    if (co?.id) return co.id;
  }
  const fallback = await prisma.company.findFirst({ select: { id: true } });
  return fallback?.id ?? null;
}

function formatTimeForUi(iso: Date | string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export type ManualAttendanceDayRow = {
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInIso: string | null;
  checkOutIso: string | null;
  totalWorkingHours: number | null;
  extraTime: string;
  status: AttendanceStatus | null;
  hasExistingRecord: boolean;
  /** UAE / Dubai public holiday on this calendar day (from official calendar). */
  publicHolidayName?: string | null;
};

export type ManualAttendanceMonthlySummary = {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  onLeaveDays: number;
  earlyDepartureDays: number;
  totalWorkingHours: number;
  daysWithRecords: number;
};

export type ManualAttendanceEmployeeRow = {
  userId: string;
  employeeId: string | null;
  employeeName: string;
  department: string | null;
  company: string | null;
  periodStartDate?: string;
  periodEndDate?: string;
  summary?: ManualAttendanceMonthlySummary;
  dailyRecords?: ManualAttendanceDayRow[];
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInIso: string | null;
  checkOutIso: string | null;
  totalWorkingHours: number | null;
  extraTime: string;
  status: AttendanceStatus | null;
  hasExistingRecord: boolean;
};

function leaveDateToYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchApprovedLeaveDaysByUser(
  userIds: string[],
  startYmd: string,
  endYmd: string,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!userIds.length) return map;

  const start = dateFromYyyyMmDd(startYmd);
  const end = dateFromYyyyMmDd(endYmd);

  const leaves = await prisma.leave.findMany({
    where: {
      userId: { in: userIds },
      status: 'APPROVED',
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { userId: true, startDate: true, endDate: true },
  });

  for (const lv of leaves) {
    const rangeStart = leaveDateToYmd(lv.startDate);
    const rangeEnd = leaveDateToYmd(lv.endDate);
    const days = enumerateDatesInRange(rangeStart, rangeEnd);
    for (const ymd of days) {
      if (ymd < startYmd || ymd > endYmd) continue;
      if (!map.has(lv.userId)) map.set(lv.userId, new Set());
      map.get(lv.userId)!.add(ymd);
    }
  }

  return map;
}

async function userHasApprovedLeaveOnDate(userId: string, dateYmd: string): Promise<boolean> {
  const attDate = dateFromYyyyMmDd(dateYmd);
  const count = await prisma.leave.count({
    where: {
      userId,
      status: 'APPROVED',
      startDate: { lte: attDate },
      endDate: { gte: attDate },
    },
  });
  return count > 0;
}

function buildDayRow(
  dateYmd: string,
  pair: { checkIn: AttendancePairRow | null; checkOut: AttendancePairRow | null } | undefined,
  onApprovedLeave = false,
  publicHolidayName: string | null = null,
): ManualAttendanceDayRow {
  const checkInTime = pair?.checkIn?.checkInTime ?? null;
  const checkOutTime = pair?.checkOut?.checkOutTime ?? null;
  const checkInDate = checkInTime ? new Date(checkInTime) : null;
  const checkOutDate = checkOutTime ? new Date(checkOutTime) : null;
  const totalWorkingHours = computeWorkingHoursFromDates(checkInDate, checkOutDate);
  const extraTimeMinutes = computeExtraTimeMinutes(checkInTime, checkOutTime, dateYmd);
  const storedStatus = pair?.checkIn?.status ?? pair?.checkOut?.status ?? null;
  const hasTimes = !!(checkInTime || checkOutTime);

  let status: AttendanceStatus;
  if (storedStatus && (!hasTimes || isStatusOnlyAttendanceStatus(storedStatus))) {
    status = storedStatus;
  } else if (onApprovedLeave && !hasTimes) {
    status = AttendanceStatus.ON_LEAVE;
  } else {
    status = deriveAttendanceStatus({
      dateYmd,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      onApprovedLeave,
    });
  }

  if (publicHolidayName && !hasTimes && !storedStatus && !onApprovedLeave) {
    status = AttendanceStatus.PUBLIC_HOLIDAY;
  }

  const hasStatusOnlyRecord = !hasTimes && storedStatus != null;

  return {
    date: dateYmd,
    checkInTime: formatTimeForUi(checkInTime),
    checkOutTime: formatTimeForUi(checkOutTime),
    checkInIso: checkInTime ? new Date(checkInTime).toISOString() : null,
    checkOutIso: checkOutTime ? new Date(checkOutTime).toISOString() : null,
    totalWorkingHours,
    extraTime: formatExtraTimeDisplay(extraTimeMinutes),
    status,
    hasExistingRecord: hasTimes || onApprovedLeave || hasStatusOnlyRecord,
    publicHolidayName,
  };
}

function summarizeDailyRecords(records: ManualAttendanceDayRow[]): ManualAttendanceMonthlySummary {
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let onLeaveDays = 0;
  let earlyDepartureDays = 0;
  let totalWorkingHours = 0;
  let daysWithRecords = 0;

  for (const day of records) {
    if (!day.hasExistingRecord) continue;
    daysWithRecords += 1;
    if (day.totalWorkingHours != null) totalWorkingHours += day.totalWorkingHours;
    switch (day.status) {
      case AttendanceStatus.PRESENT:
        presentDays += 1;
        break;
      case AttendanceStatus.ABSENT:
        absentDays += 1;
        break;
      case AttendanceStatus.LATE:
        lateDays += 1;
        break;
      case AttendanceStatus.ON_LEAVE:
        onLeaveDays += 1;
        break;
      case AttendanceStatus.EARLY_DEPARTURE:
        earlyDepartureDays += 1;
        break;
      case AttendanceStatus.VACATION:
      case AttendanceStatus.PUBLIC_HOLIDAY:
        onLeaveDays += 1;
        break;
      case AttendanceStatus.OUT_OF_LOCATION:
        presentDays += 1;
        break;
      default:
        presentDays += 1;
        break;
    }
  }

  return {
    presentDays,
    absentDays,
    lateDays,
    onLeaveDays,
    earlyDepartureDays,
    totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
    daysWithRecords,
  };
}

export async function buildCompanyScopedUserFilter(
  companyId: string,
): Promise<Prisma.UserWhereInput | undefined> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, parentCompanyId: true },
  });
  if (!company) return { id: { in: [] } };

  let parentName: string | null = null;
  if (company.parentCompanyId) {
    const parent = await prisma.company.findUnique({
      where: { id: company.parentCompanyId },
      select: { name: true },
    });
    parentName = parent?.name ?? null;
  }

  const orgCompanyIds = [company.id];
  const branches =
    company.parentCompanyId == null
      ? await prisma.company.findMany({
          where: { parentCompanyId: company.id },
          select: { id: true, name: true },
        })
      : [];
  for (const branch of branches) {
    orgCompanyIds.push(branch.id);
  }

  const scopeOr: Prisma.UserWhereInput[] = [];

  const primaryAliases = buildCompanyScopeAliases(company.name, parentName);
  if (primaryAliases.length > 0) {
    scopeOr.push({
      OR: primaryAliases.map((n) => ({
        company: { equals: n, mode: 'insensitive' },
      })),
    });
  }

  for (const branch of branches) {
    const branchAliases = buildCompanyScopeAliases(branch.name, company.name);
    if (branchAliases.length > 0) {
      scopeOr.push({
        OR: branchAliases.map((n) => ({
          company: { equals: n, mode: 'insensitive' },
        })),
      });
    }
  }

  scopeOr.push({
    positionAssignments: {
      some: {
        position: {
          subDepartment: {
            department: {
              companyId: { in: orgCompanyIds },
            },
          },
        },
      },
    },
  });

  return scopeOr.length > 0 ? { OR: scopeOr } : undefined;
}

async function fetchActiveUsers(filters: { companyId?: string; search?: string }) {
  const andParts: Prisma.UserWhereInput[] = [
    { isActive: true },
    {
      role: {
        notIn: [...ATTENDANCE_EXEMPT_ROLES, UserRole.TENDER_ENGINEER],
      },
    },
    { employeeId: { not: null } },
    { NOT: { employeeId: { equals: '' } } },
  ];

  if (filters.companyId) {
    const companyFilter = await buildCompanyScopedUserFilter(filters.companyId);
    if (companyFilter) andParts.push(companyFilter);
  }

  const search = (filters.search || '').trim();
  if (search) {
    andParts.push({
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return prisma.user.findMany({
    where: { AND: andParts },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeId: true,
      department: true,
      company: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

type AttendancePairRow = {
  userId: string;
  date: Date;
  type: string;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  status: AttendanceStatus;
};

function groupAttendanceByUserDate(
  raw: AttendancePairRow[],
): Record<string, Record<string, { checkIn: AttendancePairRow | null; checkOut: AttendancePairRow | null }>> {
  const byUserDate: Record<
    string,
    Record<string, { checkIn: AttendancePairRow | null; checkOut: AttendancePairRow | null }>
  > = {};

  for (const row of raw) {
    const dateKey = row.date.toISOString().slice(0, 10);
    if (!byUserDate[row.userId]) byUserDate[row.userId] = {};
    if (!byUserDate[row.userId][dateKey]) {
      byUserDate[row.userId][dateKey] = { checkIn: null, checkOut: null };
    }
    if (row.type === 'CHECK_IN') byUserDate[row.userId][dateKey].checkIn = row;
    if (row.type === 'CHECK_OUT') byUserDate[row.userId][dateKey].checkOut = row;
  }

  return byUserDate;
}

function mapUserToEmployeeRow(
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    employeeId: string | null;
    department: string | null;
    company: string | null;
  },
  dayRow: ManualAttendanceDayRow,
  period?: { startDate: string; endDate: string },
  dailyRecords?: ManualAttendanceDayRow[],
  summary?: ManualAttendanceMonthlySummary,
): ManualAttendanceEmployeeRow {
  return {
    userId: user.id,
    employeeId: user.employeeId,
    employeeName:
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    department: user.department,
    company: user.company,
    periodStartDate: period?.startDate,
    periodEndDate: period?.endDate,
    summary,
    dailyRecords,
    checkInTime: dayRow.checkInTime,
    checkOutTime: dayRow.checkOutTime,
    checkInIso: dayRow.checkInIso,
    checkOutIso: dayRow.checkOutIso,
    totalWorkingHours: dayRow.totalWorkingHours,
    extraTime: dayRow.extraTime,
    status: dayRow.status,
    hasExistingRecord: dayRow.hasExistingRecord,
  };
}

export async function listEmployeesForManualAttendance(
  dateYmd: string,
  filters: { companyId?: string; search?: string } = {},
): Promise<{ date: string; employees: ManualAttendanceEmployeeRow[]; publicHolidays: UaePublicHoliday[] }> {
  const attDate = dateFromYyyyMmDd(dateYmd);
  const users = await fetchActiveUsers(filters);
  const userIds = users.map((u) => u.id);

  const raw =
    userIds.length > 0
      ? await prisma.attendance.findMany({
          where: { date: attDate, userId: { in: userIds } },
          select: {
            userId: true,
            date: true,
            type: true,
            checkInTime: true,
            checkOutTime: true,
            status: true,
          },
        })
      : [];

  const byUserDate = groupAttendanceByUserDate(raw);
  const publicHolidayName = getUaePublicHolidayName(dateYmd);

  const employees: ManualAttendanceEmployeeRow[] = users.map((user) => {
    const pair = byUserDate[user.id]?.[dateYmd];
    const dayRow = buildDayRow(dateYmd, pair, false, publicHolidayName);
    return mapUserToEmployeeRow(user, dayRow);
  });

  return { date: dateYmd, employees, publicHolidays: publicHolidayName ? [{ date: dateYmd, name: publicHolidayName }] : [] };
}

export async function listEmployeesForManualAttendanceMonth(
  year: number,
  month: number,
  filters: { companyId?: string; search?: string } = {},
): Promise<{
  period: ReturnType<typeof monthPeriodFromYearMonth>;
  employees: ManualAttendanceEmployeeRow[];
  publicHolidays: UaePublicHoliday[];
}> {
  const period = capManualEntryPeriodToToday(monthPeriodFromYearMonth(year, month));
  const dates = enumerateDatesInRange(period.startDate, period.endDate);
  const publicHolidays = getUaePublicHolidaysInRange(period.startDate, period.endDate);
  const holidayMap = buildUaePublicHolidayMap(period.startDate, period.endDate);
  const users = await fetchActiveUsers(filters);
  const userIds = users.map((u) => u.id);

  const raw =
    userIds.length > 0
      ? await prisma.attendance.findMany({
          where: {
            userId: { in: userIds },
            date: {
              gte: dateFromYyyyMmDd(period.startDate),
              lte: dateFromYyyyMmDd(period.endDate),
            },
          },
          select: {
            userId: true,
            date: true,
            type: true,
            checkInTime: true,
            checkOutTime: true,
            status: true,
          },
          orderBy: [{ date: 'asc' }],
        })
      : [];

  const byUserDate = groupAttendanceByUserDate(raw);
  const leaveDaysByUser = await fetchApprovedLeaveDaysByUser(
    userIds,
    period.startDate,
    period.endDate,
  );

  const employees: ManualAttendanceEmployeeRow[] = users.map((user) => {
    const userDays = byUserDate[user.id] ?? {};
    const leaveDays = leaveDaysByUser.get(user.id);
    const dailyRecords = dates.map((dateYmd) =>
      buildDayRow(
        dateYmd,
        userDays[dateYmd],
        leaveDays?.has(dateYmd) ?? false,
        holidayMap.get(dateYmd) ?? null,
      ),
    );
    const summary = summarizeDailyRecords(dailyRecords);
    const lastRecordedDay = [...dailyRecords].reverse().find((d) => d.hasExistingRecord);
    const displayDay =
      lastRecordedDay ??
      buildDayRow(period.endDate, undefined, false, holidayMap.get(period.endDate) ?? null);

    return mapUserToEmployeeRow(
      user,
      displayDay,
      { startDate: period.startDate, endDate: period.endDate },
      dailyRecords,
      summary,
    );
  });

  return { period, employees, publicHolidays };
}

export type ManualAttendanceSaveEntry = {
  userId: string;
  date?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: string | null;
};

export type ManualAttendanceSaveResult = {
  saved: number;
  skipped: number;
  failed: number;
  errors: Array<{ userId: string; date?: string; message: string }>;
};

async function saveOneManualAttendanceEntry(
  dateYmd: string,
  entry: ManualAttendanceSaveEntry,
  auditMeta: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (dateYmd > localTodayYmd()) {
    return { ok: false, message: 'Cannot enter attendance for a future date' };
  }

  const userId = String(entry.userId || '').trim();
  if (!userId) {
    return { ok: false, message: 'Missing employee' };
  }

  const checkInStr = entry.checkInTime != null ? String(entry.checkInTime).trim() : '';
  const checkOutStr = entry.checkOutTime != null ? String(entry.checkOutTime).trim() : '';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, company: true, isActive: true },
  });
  if (!user) {
    return { ok: false, message: 'Employee not found' };
  }

  const checkInParsed = checkInStr ? parseTimeOnCalendarDay(dateYmd, checkInStr) : null;
  const checkOutParsed = checkOutStr ? parseTimeOnCalendarDay(dateYmd, checkOutStr) : null;

  if (checkInStr && !checkInParsed) {
    return { ok: false, message: 'Invalid check-in time' };
  }
  if (checkOutStr && !checkOutParsed) {
    return { ok: false, message: 'Invalid check-out time' };
  }
  if (
    checkInParsed &&
    checkOutParsed &&
    checkOutParsed.getTime() <= checkInParsed.getTime()
  ) {
    return { ok: false, message: 'Check-out must be after check-in' };
  }

  const onApprovedLeave = await userHasApprovedLeaveOnDate(userId, dateYmd);
  const explicitStatus = mapAttendanceStatusLabel(entry.status);
  const isStatusOnlySave =
    explicitStatus != null && !checkInStr && !checkOutStr;

  if (!checkInStr && !checkOutStr && !onApprovedLeave && !isStatusOnlySave) {
    return { ok: false, message: 'No attendance data to save' };
  }

  let status: AttendanceStatus;
  if (isStatusOnlySave && explicitStatus) {
    status = explicitStatus;
  } else {
    status = deriveAttendanceStatusFromTimeStrings(
      dateYmd,
      checkInStr || null,
      checkOutStr || null,
      onApprovedLeave,
    );
    if (explicitStatus) {
      status = explicitStatus;
    }
  }
  const companyId = await resolveCompanyIdForUser(user);
  const attDate = dateFromYyyyMmDd(dateYmd);

  if (checkInParsed) {
    await prisma.attendance.upsert({
      where: {
        userId_date_type: { userId, date: attDate, type: 'CHECK_IN' },
      },
      create: {
        userId,
        companyId,
        type: 'CHECK_IN',
        date: attDate,
        checkInTime: checkInParsed,
        status,
        deviceInfo: auditMeta,
        isWithinRadius: true,
      },
      update: {
        checkInTime: checkInParsed,
        status,
        deviceInfo: auditMeta,
      },
    });
  } else if (isStatusOnlySave && explicitStatus) {
    await prisma.attendance.upsert({
      where: {
        userId_date_type: { userId, date: attDate, type: 'CHECK_IN' },
      },
      create: {
        userId,
        companyId,
        type: 'CHECK_IN',
        date: attDate,
        status,
        deviceInfo: auditMeta,
        isWithinRadius: true,
      },
      update: {
        status,
        deviceInfo: auditMeta,
      },
    });
    await prisma.attendance.updateMany({
      where: { userId, date: attDate },
      data: { status, deviceInfo: auditMeta },
    });
  }

  if (checkOutParsed) {
    await prisma.attendance.upsert({
      where: {
        userId_date_type: { userId, date: attDate, type: 'CHECK_OUT' },
      },
      create: {
        userId,
        companyId,
        type: 'CHECK_OUT',
        date: attDate,
        checkOutTime: checkOutParsed,
        status,
        deviceInfo: auditMeta,
        isWithinRadius: true,
      },
      update: {
        checkOutTime: checkOutParsed,
        status,
        deviceInfo: auditMeta,
      },
    });

    if (checkInParsed) {
      await prisma.attendance.updateMany({
        where: {
          userId,
          date: attDate,
          type: 'CHECK_IN',
        },
        data: { checkOutTime: checkOutParsed },
      });
    }
  }

  return { ok: true };
}

export async function saveManualAttendanceEntries(
  defaultDateYmd: string | null,
  entries: ManualAttendanceSaveEntry[],
  actorUserId?: string,
): Promise<ManualAttendanceSaveResult> {
  const auditMeta = actorUserId
    ? JSON.stringify({ source: 'MANUAL_ENTRY', actorId: actorUserId })
    : JSON.stringify({ source: 'MANUAL_ENTRY' });

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ userId: string; date?: string; message: string }> = [];

  for (const entry of entries) {
    const userId = String(entry.userId || '').trim();
    const entryDate =
      entry.date != null && String(entry.date).trim()
        ? String(entry.date).trim()
        : defaultDateYmd;

    if (!userId) {
      skipped += 1;
      continue;
    }

    if (!entryDate || !isValidAttendanceYmd(entryDate)) {
      failed += 1;
      errors.push({ userId, date: entryDate ?? undefined, message: 'Valid date is required (YYYY-MM-DD)' });
      continue;
    }

    const checkInStr = entry.checkInTime != null ? String(entry.checkInTime).trim() : '';
    const checkOutStr = entry.checkOutTime != null ? String(entry.checkOutTime).trim() : '';
    if (!checkInStr && !checkOutStr) {
      skipped += 1;
      continue;
    }

    try {
      const result = await saveOneManualAttendanceEntry(entryDate, entry, auditMeta);
      if (result.ok) {
        saved += 1;
      } else {
        failed += 1;
        errors.push({ userId, date: entryDate, message: result.message });
      }
    } catch (err: unknown) {
      failed += 1;
      errors.push({
        userId,
        date: entryDate,
        message: err instanceof Error ? err.message : 'Save failed',
      });
    }
  }

  return { saved, skipped, failed, errors };
}
