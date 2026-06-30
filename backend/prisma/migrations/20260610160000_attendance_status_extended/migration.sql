-- Extend manual attendance status options (vacation, public holiday, out of location).
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'VACATION';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'PUBLIC_HOLIDAY';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'OUT_OF_LOCATION';
