-- AlterEnum: Add new leave types (UAE labor law compliant)
ALTER TYPE "LeaveType" ADD VALUE 'EMERGENCY';
ALTER TYPE "LeaveType" ADD VALUE 'BEREAVEMENT';
ALTER TYPE "LeaveType" ADD VALUE 'PATERNITY';
ALTER TYPE "LeaveType" ADD VALUE 'MATERNITY';

-- AlterTable: Add policy and reporting fields to leaves
ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "relationOrContext" TEXT;
ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "reportedAbsenceAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "documentationReceivedAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "rescheduledStartDate" DATE;
ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "rescheduledEndDate" DATE;
ALTER TABLE "leaves" ADD COLUMN IF NOT EXISTS "rescheduledAt" TIMESTAMPTZ;

-- CreateTable: Leave policies (entitlements, carry-forward, advance notice, UAE compliance)
CREATE TABLE IF NOT EXISTS "leave_policies" (
    "id" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leave_policies_leaveType_key" ON "leave_policies"("leaveType");
