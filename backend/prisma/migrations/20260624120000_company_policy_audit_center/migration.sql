-- Company Policy Audit Center: lifecycle, assignments, immutable audit log

CREATE TYPE "CompanyPolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'EXPIRED');
CREATE TYPE "PolicyAssignmentStatus" AS ENUM ('ASSIGNED', 'NOT_VIEWED', 'VIEWED', 'DOWNLOADED', 'ACKNOWLEDGED', 'OVERDUE', 'EXPIRED');

ALTER TABLE "company_policies"
  ADD COLUMN IF NOT EXISTS "status" "CompanyPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "publishDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dueDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "contentHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "assignRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "assignUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "company_policies"
SET "status" = 'PUBLISHED',
    "publishDate" = COALESCE("publishDate", "createdAt")
WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "company_policies_status_idx" ON "company_policies"("status");

CREATE TABLE IF NOT EXISTS "company_policy_assignments" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "PolicyAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "viewedAt" TIMESTAMP(3),
  "downloadedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMP(3),
  CONSTRAINT "company_policy_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_policy_assignments_policyId_userId_key"
  ON "company_policy_assignments"("policyId", "userId");
CREATE INDEX IF NOT EXISTS "company_policy_assignments_policyId_idx" ON "company_policy_assignments"("policyId");
CREATE INDEX IF NOT EXISTS "company_policy_assignments_userId_idx" ON "company_policy_assignments"("userId");
CREATE INDEX IF NOT EXISTS "company_policy_assignments_status_idx" ON "company_policy_assignments"("status");

ALTER TABLE "company_policy_assignments"
  ADD CONSTRAINT "company_policy_assignments_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "company_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_policy_assignments"
  ADD CONSTRAINT "company_policy_assignments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "company_policy_audit_logs" (
  "id" TEXT NOT NULL,
  "policyId" TEXT,
  "userId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "actorName" TEXT,
  "employeeId" TEXT,
  "department" TEXT,
  "policyTitle" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_policy_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "company_policy_audit_logs_policyId_createdAt_idx"
  ON "company_policy_audit_logs"("policyId", "createdAt");
CREATE INDEX IF NOT EXISTS "company_policy_audit_logs_userId_createdAt_idx"
  ON "company_policy_audit_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "company_policy_audit_logs_action_createdAt_idx"
  ON "company_policy_audit_logs"("action", "createdAt");

ALTER TABLE "company_policy_audit_logs"
  ADD CONSTRAINT "company_policy_audit_logs_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "company_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_policy_audit_logs"
  ADD CONSTRAINT "company_policy_audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_policy_audit_logs"
  ADD CONSTRAINT "company_policy_audit_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
