-- Internal ERP workflow: pending approval → OTP generated → verified → deleted / rejected

ALTER TABLE "project_deletion_otp_requests" ALTER COLUMN "otpHash" DROP NOT NULL;
ALTER TABLE "project_deletion_otp_requests" ALTER COLUMN "expiresAt" DROP NOT NULL;

ALTER TABLE "project_deletion_otp_requests" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "project_deletion_otp_requests" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "project_deletion_otp_requests" ADD COLUMN IF NOT EXISTS "rejectedById" TEXT;
ALTER TABLE "project_deletion_otp_requests" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "project_deletion_otp_requests" ADD COLUMN IF NOT EXISTS "otpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "project_deletion_otp_requests" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "project_deletion_otp_requests" SET "status" = 'PENDING_APPROVAL' WHERE "status" = 'PENDING';
UPDATE "project_deletion_otp_requests" SET "status" = 'DELETED' WHERE "status" = 'USED';

ALTER TABLE "project_deletion_otp_requests"
  ADD CONSTRAINT "project_deletion_otp_requests_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_deletion_otp_requests"
  ADD CONSTRAINT "project_deletion_otp_requests_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
