-- Line-manager approval workflow for ANNUAL/UNPAID leave
CREATE TYPE "LeaveManagerApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "leaves" ADD COLUMN "managerApprovalStatus" "LeaveManagerApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "leaves" ADD COLUMN "managerActionById" TEXT;
ALTER TABLE "leaves" ADD COLUMN "managerActionAt" TIMESTAMPTZ(6);
ALTER TABLE "leaves" ADD COLUMN "managerRejectionReason" TEXT;

CREATE INDEX "leaves_managerApprovalStatus_idx" ON "leaves"("managerApprovalStatus");

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_managerActionById_fkey" FOREIGN KEY ("managerActionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
