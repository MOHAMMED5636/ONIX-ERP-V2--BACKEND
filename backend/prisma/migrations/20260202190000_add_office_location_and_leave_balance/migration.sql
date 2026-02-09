-- AlterTable: Add office location columns to companies (for attendance check-in)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "officeLatitude" DOUBLE PRECISION;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "officeLongitude" DOUBLE PRECISION;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "attendanceRadius" DOUBLE PRECISION DEFAULT 200;

-- AlterTable: Add annual leave balance to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "annualLeaveBalance" INTEGER DEFAULT 25;
