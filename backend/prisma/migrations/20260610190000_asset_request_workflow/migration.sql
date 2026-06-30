-- Asset Request, Approval, Custody & Clearance Workflow

CREATE TYPE "AssetRequestStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'PENDING_PM_APPROVAL', 'PENDING_HR_VERIFICATION',
  'PENDING_FINANCE_APPROVAL', 'PENDING_FINAL_HR_APPROVAL', 'PENDING_ASSET_ASSIGNMENT',
  'PENDING_PROCUREMENT', 'ASSET_ISSUED', 'REJECTED', 'CLOSED', 'CANCELLED'
);

CREATE TYPE "AssetRequestUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "AssetRequestApprovalStep" AS ENUM (
  'PROJECT_MANAGER', 'HR_VERIFICATION', 'FINANCE', 'HR_FINAL', 'ASSET_MANAGER', 'ASSET_DIRECTOR'
);

CREATE TYPE "AssetRequestApprovalDecision" AS ENUM (
  'APPROVED', 'REJECTED', 'CLARIFICATION', 'RETURNED'
);

CREATE TYPE "AssetReturnOutcome" AS ENUM (
  'RETURNED_GOOD', 'RETURNED_DAMAGED', 'LOST', 'STOLEN', 'REPAIR_REQUIRED'
);

CREATE TYPE "AssetDamageCaseStatus" AS ENUM (
  'OPEN', 'UNDER_REVIEW', 'REPAIR', 'RECOVER_COST', 'WRITTEN_OFF', 'INSURANCE', 'CLOSED'
);

CREATE TYPE "AssetLossCaseStatus" AS ENUM (
  'OPEN', 'UNDER_REVIEW', 'RECOVERED', 'PARTIAL_RECOVERY', 'INSURANCE', 'WRITTEN_OFF', 'CLOSED'
);

CREATE TYPE "AssetClearanceItemStatus" AS ENUM ('PENDING', 'RETURNED', 'DAMAGED', 'LOST', 'WAIVED');

CREATE TABLE "asset_request_sequences" (
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "asset_request_sequences_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "asset_requests" (
  "id" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "department" TEXT,
  "subDepartment" TEXT,
  "projectId" TEXT,
  "designation" TEXT,
  "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "categoryId" TEXT NOT NULL,
  "assetType" TEXT,
  "brandPreference" TEXT,
  "modelPreference" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "businessJustification" TEXT NOT NULL,
  "urgency" "AssetRequestUrgency" NOT NULL DEFAULT 'MEDIUM',
  "requiredByDate" DATE,
  "expectedUsageDuration" TEXT,
  "additionalNotes" TEXT,
  "attachmentPath" TEXT,
  "status" "AssetRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "assignedProjectManagerId" TEXT,
  "purchaseRequisitionId" TEXT,
  "custodyDocumentPath" TEXT,
  "submittedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_request_approvals" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "step" "AssetRequestApprovalStep" NOT NULL,
  "decision" "AssetRequestApprovalDecision" NOT NULL,
  "comments" TEXT,
  "approvalNotes" TEXT,
  "approverId" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "asset_request_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_request_assignments" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conditionNotes" TEXT,
  "warrantyInfo" TEXT,
  "locationType" "AssetLocationType",
  "locationId" TEXT,
  "department" TEXT,
  "projectId" TEXT,
  "assignedById" TEXT,
  "custodyDocPath" TEXT,
  "previousCustodianId" TEXT,
  "transferReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_request_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_returns" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "assetId" TEXT NOT NULL,
  "custodianId" TEXT NOT NULL,
  "processedById" TEXT,
  "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" "AssetReturnOutcome" NOT NULL,
  "conditionNotes" TEXT,
  "accessoriesReturned" TEXT,
  "damageDetails" TEXT,
  "missingComponents" TEXT,
  "photoPaths" JSONB,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_damage_cases" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "requestId" TEXT,
  "assetId" TEXT NOT NULL,
  "status" "AssetDamageCaseStatus" NOT NULL DEFAULT 'OPEN',
  "description" TEXT NOT NULL,
  "estimatedCost" DECIMAL(12,2),
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_damage_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_loss_cases" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "requestId" TEXT,
  "assetId" TEXT NOT NULL,
  "status" "AssetLossCaseStatus" NOT NULL DEFAULT 'OPEN',
  "employeeExplanation" TEXT,
  "recoveryAmount" DECIMAL(12,2),
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_loss_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_clearance_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resignationId" TEXT,
  "assetId" TEXT,
  "assetLabel" TEXT NOT NULL,
  "status" "AssetClearanceItemStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_clearance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asset_request_audit_logs" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "previousStatus" "AssetRequestStatus",
  "newStatus" "AssetRequestStatus",
  "comment" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_request_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_requests_requestNumber_key" ON "asset_requests"("requestNumber");
CREATE INDEX "asset_requests_employeeId_idx" ON "asset_requests"("employeeId");
CREATE INDEX "asset_requests_status_idx" ON "asset_requests"("status");
CREATE INDEX "asset_requests_assignedProjectManagerId_idx" ON "asset_requests"("assignedProjectManagerId");
CREATE INDEX "asset_requests_projectId_idx" ON "asset_requests"("projectId");

CREATE INDEX "asset_request_approvals_requestId_idx" ON "asset_request_approvals"("requestId");
CREATE INDEX "asset_request_approvals_step_idx" ON "asset_request_approvals"("step");

CREATE INDEX "asset_request_assignments_requestId_idx" ON "asset_request_assignments"("requestId");
CREATE INDEX "asset_request_assignments_assetId_idx" ON "asset_request_assignments"("assetId");
CREATE INDEX "asset_request_assignments_employeeId_idx" ON "asset_request_assignments"("employeeId");

CREATE INDEX "asset_returns_assetId_idx" ON "asset_returns"("assetId");
CREATE INDEX "asset_returns_custodianId_idx" ON "asset_returns"("custodianId");

CREATE UNIQUE INDEX "asset_damage_cases_returnId_key" ON "asset_damage_cases"("returnId");
CREATE INDEX "asset_damage_cases_assetId_idx" ON "asset_damage_cases"("assetId");

CREATE UNIQUE INDEX "asset_loss_cases_returnId_key" ON "asset_loss_cases"("returnId");
CREATE INDEX "asset_loss_cases_assetId_idx" ON "asset_loss_cases"("assetId");

CREATE INDEX "asset_clearance_records_userId_idx" ON "asset_clearance_records"("userId");
CREATE INDEX "asset_clearance_records_resignationId_idx" ON "asset_clearance_records"("resignationId");

CREATE INDEX "asset_request_audit_logs_requestId_createdAt_idx" ON "asset_request_audit_logs"("requestId", "createdAt");

ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_assignedProjectManagerId_fkey" FOREIGN KEY ("assignedProjectManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_request_approvals" ADD CONSTRAINT "asset_request_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "asset_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_request_approvals" ADD CONSTRAINT "asset_request_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_request_assignments" ADD CONSTRAINT "asset_request_assignments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "asset_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_request_assignments" ADD CONSTRAINT "asset_request_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_request_assignments" ADD CONSTRAINT "asset_request_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_returns" ADD CONSTRAINT "asset_returns_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "asset_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_returns" ADD CONSTRAINT "asset_returns_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_returns" ADD CONSTRAINT "asset_returns_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_returns" ADD CONSTRAINT "asset_returns_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_damage_cases" ADD CONSTRAINT "asset_damage_cases_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "asset_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_damage_cases" ADD CONSTRAINT "asset_damage_cases_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "asset_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_damage_cases" ADD CONSTRAINT "asset_damage_cases_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_loss_cases" ADD CONSTRAINT "asset_loss_cases_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "asset_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_loss_cases" ADD CONSTRAINT "asset_loss_cases_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "asset_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_loss_cases" ADD CONSTRAINT "asset_loss_cases_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_clearance_records" ADD CONSTRAINT "asset_clearance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_clearance_records" ADD CONSTRAINT "asset_clearance_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_request_audit_logs" ADD CONSTRAINT "asset_request_audit_logs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "asset_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_request_audit_logs" ADD CONSTRAINT "asset_request_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
