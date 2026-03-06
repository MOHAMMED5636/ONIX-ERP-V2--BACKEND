-- CreateEnum: Add DELEGATED to TaskAssignmentStatus
ALTER TYPE "TaskAssignmentStatus" ADD VALUE 'DELEGATED';

-- CreateTable: Task delegations audit
CREATE TABLE "task_delegations" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "originalAssigneeId" TEXT NOT NULL,
    "newAssigneeId" TEXT NOT NULL,
    "delegatedById" TEXT NOT NULL,
    "delegatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "task_delegations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_delegations_taskId_idx" ON "task_delegations"("taskId");
CREATE INDEX "task_delegations_originalAssigneeId_idx" ON "task_delegations"("originalAssigneeId");
CREATE INDEX "task_delegations_newAssigneeId_idx" ON "task_delegations"("newAssigneeId");
CREATE INDEX "task_delegations_delegatedAt_idx" ON "task_delegations"("delegatedAt");

ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_originalAssigneeId_fkey" FOREIGN KEY ("originalAssigneeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_newAssigneeId_fkey" FOREIGN KEY ("newAssigneeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_delegations" ADD CONSTRAINT "task_delegations_delegatedById_fkey" FOREIGN KEY ("delegatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
