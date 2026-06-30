import { AttendanceStatus } from '@prisma/client';
import { parseTimeOnCalendarDay } from './attendance-admin-rows';

/** Office day: check-in by 08:00, grace until 08:15, full day until 18:30 checkout. */
export const OFFICE_CHECK_IN_HOUR = 8;
export const OFFICE_CHECK_IN_MINUTE = 0;
export const LATE_GRACE_MINUTES = 15;
export const OFFICE_CHECK_OUT_HOUR = 18;
export const OFFICE_CHECK_OUT_MINUTE = 30;

function officeMoment(
  ymd: string,
  hour: number,
  minute: number,
): Date | null {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

export function officeStartOnDay(ymd: string): Date | null {
  return officeMoment(ymd, OFFICE_CHECK_IN_HOUR, OFFICE_CHECK_IN_MINUTE);
}

export function lateCutoffOnDay(ymd: string): Date | null {
  const start = officeStartOnDay(ymd);
  if (!start) return null;
  return new Date(start.getTime() + LATE_GRACE_MINUTES * 60 * 1000);
}

export function officeEndOnDay(ymd: string): Date | null {
  return officeMoment(ymd, OFFICE_CHECK_OUT_HOUR, OFFICE_CHECK_OUT_MINUTE);
}

export type DeriveAttendanceStatusInput = {
  dateYmd: string;
  checkIn: Date | null;
  checkOut: Date | null;
  /** When true, approved leave covers this calendar day. */
  onApprovedLeave?: boolean;
};

/**
 * Derive attendance status from check-in / check-out (local office timezone).
 * Priority: On Leave → Early Departure → Present / Late / Absent.
 */
export function deriveAttendanceStatus(
  input: DeriveAttendanceStatusInput,
): AttendanceStatus {
  if (input.onApprovedLeave) {
    return AttendanceStatus.ON_LEAVE;
  }

  const { checkIn, checkOut, dateYmd } = input;
  const officeEnd = officeEndOnDay(dateYmd);
  const officeStart = officeStartOnDay(dateYmd);
  const lateCutoff = lateCutoffOnDay(dateYmd);

  if (!checkIn && !checkOut) {
    return AttendanceStatus.ABSENT;
  }

  if (!officeEnd || !officeStart || !lateCutoff) {
    return AttendanceStatus.ABSENT;
  }

  if (!checkIn || !checkOut) {
    return AttendanceStatus.ABSENT;
  }

  if (checkOut.getTime() < officeEnd.getTime()) {
    return AttendanceStatus.EARLY_DEPARTURE;
  }

  if (checkOut.getTime() <= checkIn.getTime()) {
    return AttendanceStatus.ABSENT;
  }

  if (checkIn.getTime() <= officeStart.getTime()) {
    return AttendanceStatus.PRESENT;
  }

  if (checkIn.getTime() <= lateCutoff.getTime()) {
    return AttendanceStatus.LATE;
  }

  return AttendanceStatus.LATE;
}

export function deriveAttendanceStatusFromTimeStrings(
  dateYmd: string,
  checkInStr: string | null | undefined,
  checkOutStr: string | null | undefined,
  onApprovedLeave?: boolean,
): AttendanceStatus {
  const checkIn = checkInStr?.trim()
    ? parseTimeOnCalendarDay(dateYmd, checkInStr.trim())
    : null;
  const checkOut = checkOutStr?.trim()
    ? parseTimeOnCalendarDay(dateYmd, checkOutStr.trim())
    : null;
  return deriveAttendanceStatus({
    dateYmd,
    checkIn,
    checkOut,
    onApprovedLeave,
  });
}

export function computeWorkingHoursFromDates(
  checkIn: Date | null,
  checkOut: Date | null,
): number | null {
  if (!checkIn || !checkOut) return null;
  const durationMs = checkOut.getTime() - checkIn.getTime();
  if (durationMs <= 0) return null;
  return Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
}

/** Statuses HR can set without check-in / check-out times. */
export const STATUS_ONLY_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.ABSENT,
  AttendanceStatus.ON_LEAVE,
  AttendanceStatus.VACATION,
  AttendanceStatus.PUBLIC_HOLIDAY,
  AttendanceStatus.OUT_OF_LOCATION,
];

export function isStatusOnlyAttendanceStatus(status: AttendanceStatus): boolean {
  return STATUS_ONLY_ATTENDANCE_STATUSES.includes(status);
}
