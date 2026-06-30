-- Employee resignation management workflow
CREATE TYPE "ResignationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'COMPLETED', 'ON_HOLD');
CREATE TYPE "ResignationWorkflowStage" AS ENUM (
  'PENDING_PROJECT_MANAGER',
  'DISCUSSION_REQUESTED',
  'PENDING_GM_RETENTION_REVIEW',
  'PENDING_EMPLOYEE_RETENTION_RESPONSE',
  'REJECTED_BY_PROJECT_MANAGER',
  'PENDING_HR_REVIEW',
  'REJECTED_BY_HR',
  'PENDING_FINANCE_CLEARANCE',
  'FINANCE_CLEARANCE_REJECTED',
  'FINANCE_CLEARANCE_ON_HOLD',
  'PENDING_HR_FINAL_CLEARANCE',
  'HR_FINAL_ON_HOLD',
  'REJECTED_HR_FINAL',
  'RESIGNATION_COMPLETED',
  'WITHDRAWN'
);
CREATE TYPE "RetentionRecommendation" AS ENUM (
  'NO_RETENTION',
  'RETAIN_EMPLOYEE',
  'SALARY_INCREMENT',
  'PROMOTION',
  'DEPARTMENT_TRANSFER',
  'ADDITIONAL_BENEFITS',
  'CRITICAL_RESOURCE_MGMT_REVIEW'
);

CREATE TABLE "resignation_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "ResignationStatus" NOT NULL DEFAULT 'PENDING',
  "workflowStage" "ResignationWorkflowStage" NOT NULL DEFAULT 'PENDING_PROJECT_MANAGER',
  "intendedLastWorkingDay" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "comments" TEXT,
  "employmentContractPath" TEXT NOT NULL,
  "supportingDocuments" TEXT,
  "assignedProjectManagerId" TEXT,
  "retentionRecommendation" "RetentionRecommendation",
  "performanceAssessment" TEXT,
  "businessImpactAssessment" TEXT,
  "retentionNotes" TEXT,
  "pmActionById" TEXT,
  "pmActionAt" TIMESTAMP(3),
  "pmComments" TEXT,
  "gmActionById" TEXT,
  "gmActionAt" TIMESTAMP(3),
  "gmComments" TEXT,
  "retentionOffer" JSONB,
  "retentionOfferAccepted" BOOLEAN,
  "retentionResponseAt" TIMESTAMP(3),
  "hrReviewById" TEXT,
  "hrReviewAt" TIMESTAMP(3),
  "hrReviewComments" TEXT,
  "financeClearanceStatus" TEXT,
  "financeRemarks" TEXT,
  "financeChecklist" JSONB,
  "financeActionById" TEXT,
  "financeActionAt" TIMESTAMP(3),
  "assetChecklist" JSONB,
  "exitChecklist" JSONB,
  "hrFinalById" TEXT,
  "hrFinalAt" TIMESTAMP(3),
  "hrFinalComments" TEXT,
  "finalExitDate" DATE,
  "relievingLetterPath" TEXT,
  "experienceCertificatePath" TEXT,
  "settlementRequestRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "resignation_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resignation_workflow_logs" (
  "id" TEXT NOT NULL,
  "resignationId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "previousStage" "ResignationWorkflowStage",
  "newStage" "ResignationWorkflowStage",
  "comment" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resignation_workflow_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_assignedProjectManagerId_fkey" FOREIGN KEY ("assignedProjectManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_pmActionById_fkey" FOREIGN KEY ("pmActionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_gmActionById_fkey" FOREIGN KEY ("gmActionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_hrReviewById_fkey" FOREIGN KEY ("hrReviewById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_financeActionById_fkey" FOREIGN KEY ("financeActionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resignation_requests" ADD CONSTRAINT "resignation_requests_hrFinalById_fkey" FOREIGN KEY ("hrFinalById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resignation_workflow_logs" ADD CONSTRAINT "resignation_workflow_logs_resignationId_fkey" FOREIGN KEY ("resignationId") REFERENCES "resignation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resignation_workflow_logs" ADD CONSTRAINT "resignation_workflow_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "resignation_requests_userId_idx" ON "resignation_requests"("userId");
CREATE INDEX "resignation_requests_status_idx" ON "resignation_requests"("status");
CREATE INDEX "resignation_requests_workflowStage_idx" ON "resignation_requests"("workflowStage");
CREATE INDEX "resignation_requests_assignedProjectManagerId_idx" ON "resignation_requests"("assignedProjectManagerId");
CREATE INDEX "resignation_workflow_logs_resignationId_idx" ON "resignation_workflow_logs"("resignationId");
