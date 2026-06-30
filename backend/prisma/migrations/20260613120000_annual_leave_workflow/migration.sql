-- Annual leave enterprise workflow
CREATE TYPE "LeaveWorkflowStage" AS ENUM (
  'DRAFT',
  'PENDING_LINE_MANAGER',
  'PENDING_HR_REVIEW',
  'PENDING_PROJECT_CONFIRMATION',
  'PROJECT_CONFLICT_REPORTED',
  'ON_HOLD',
  'PENDING_FINANCE_CLEARANCE',
  'FINANCE_CLEARED',
  'FINANCE_ISSUE_FOUND',
  'PENDING_HR_FINAL',
  'APPROVED',
  'CERTIFICATE_GENERATED',
  'REJECTED_BY_MANAGER',
  'REJECTED_BY_HR'
);

ALTER TABLE "leaves" ADD COLUMN "workflowStage" "LeaveWorkflowStage";
ALTER TABLE "leaves" ADD COLUMN "assignedLineManagerId" TEXT;
ALTER TABLE "leaves" ADD COLUMN "projectConflict" BOOLEAN;
ALTER TABLE "leaves" ADD COLUMN "projectConfirmationNotes" TEXT;
ALTER TABLE "leaves" ADD COLUMN "projectConfirmedById" TEXT;
ALTER TABLE "leaves" ADD COLUMN "projectConfirmedAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN "financeClearanceStatus" TEXT;
ALTER TABLE "leaves" ADD COLUMN "financeRemarks" TEXT;
ALTER TABLE "leaves" ADD COLUMN "financeActionById" TEXT;
ALTER TABLE "leaves" ADD COLUMN "financeActionAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN "hrFinalApprovedAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN "certificateFilename" TEXT;
ALTER TABLE "leaves" ADD COLUMN "certificateGeneratedAt" TIMESTAMPTZ;
ALTER TABLE "leaves" ADD COLUMN "returnToWorkDate" DATE;
ALTER TABLE "leaves" ADD COLUMN "onHoldReason" TEXT;

CREATE TABLE "leave_workflow_logs" (
  "id" TEXT NOT NULL,
  "leaveId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "previousStage" "LeaveWorkflowStage",
  "newStage" "LeaveWorkflowStage",
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_workflow_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leave_workflow_logs_leaveId_idx" ON "leave_workflow_logs"("leaveId");
CREATE INDEX "leaves_workflowStage_idx" ON "leaves"("workflowStage");

ALTER TABLE "leave_workflow_logs" ADD CONSTRAINT "leave_workflow_logs_leaveId_fkey"
  FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leave_workflow_logs" ADD CONSTRAINT "leave_workflow_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_assignedLineManagerId_fkey"
  FOREIGN KEY ("assignedLineManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_projectConfirmedById_fkey"
  FOREIGN KEY ("projectConfirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_financeActionById_fkey"
  FOREIGN KEY ("financeActionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
