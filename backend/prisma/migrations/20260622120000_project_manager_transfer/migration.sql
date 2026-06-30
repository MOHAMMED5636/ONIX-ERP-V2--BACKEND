-- CreateEnum
CREATE TYPE "ProjectManagerTransferStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "project_manager_transfers" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "oldProjectManagerId" TEXT NOT NULL,
    "newProjectManagerId" TEXT NOT NULL,
    "transferReason" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "transferredById" TEXT NOT NULL,
    "status" "ProjectManagerTransferStatus" NOT NULL DEFAULT 'ACTIVE',
    "previousManagerId" TEXT,
    "previousManagerEmail" TEXT,
    "previousProjectManagerText" VARCHAR(100),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_manager_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_manager_transfers_projectId_status_idx" ON "project_manager_transfers"("projectId", "status");

-- CreateIndex
CREATE INDEX "project_manager_transfers_oldProjectManagerId_status_idx" ON "project_manager_transfers"("oldProjectManagerId", "status");

-- CreateIndex
CREATE INDEX "project_manager_transfers_newProjectManagerId_status_idx" ON "project_manager_transfers"("newProjectManagerId", "status");

-- CreateIndex
CREATE INDEX "project_manager_transfers_status_endDate_idx" ON "project_manager_transfers"("status", "endDate");

-- AddForeignKey
ALTER TABLE "project_manager_transfers" ADD CONSTRAINT "project_manager_transfers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_manager_transfers" ADD CONSTRAINT "project_manager_transfers_oldProjectManagerId_fkey" FOREIGN KEY ("oldProjectManagerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_manager_transfers" ADD CONSTRAINT "project_manager_transfers_newProjectManagerId_fkey" FOREIGN KEY ("newProjectManagerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_manager_transfers" ADD CONSTRAINT "project_manager_transfers_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
