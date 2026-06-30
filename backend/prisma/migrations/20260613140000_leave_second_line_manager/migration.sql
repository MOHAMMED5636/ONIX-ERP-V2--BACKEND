-- Dual line manager support on leave requests
ALTER TABLE "leaves" ADD COLUMN "assignedSecondLineManagerId" TEXT;
ALTER TABLE "leaves" ADD COLUMN "secondManagerApprovalStatus" "LeaveManagerApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "leaves" ADD COLUMN "secondManagerActionById" TEXT;
ALTER TABLE "leaves" ADD COLUMN "secondManagerActionAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN "secondManagerRejectionReason" TEXT;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_assignedSecondLineManagerId_fkey"
  FOREIGN KEY ("assignedSecondLineManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_secondManagerActionById_fkey"
  FOREIGN KEY ("secondManagerActionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leaves_assignedSecondLineManagerId_idx" ON "leaves"("assignedSecondLineManagerId");
