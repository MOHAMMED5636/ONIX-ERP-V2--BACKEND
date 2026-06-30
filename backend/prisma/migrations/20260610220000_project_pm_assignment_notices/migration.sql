-- CreateTable
CREATE TABLE "project_pm_assignment_notices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" VARCHAR(24) NOT NULL DEFAULT 'ASSIGNMENT',
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "project_pm_assignment_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_pm_assignment_notices_userId_projectId_key" ON "project_pm_assignment_notices"("userId", "projectId");

-- CreateIndex
CREATE INDEX "project_pm_assignment_notices_userId_seenAt_idx" ON "project_pm_assignment_notices"("userId", "seenAt");

-- AddForeignKey
ALTER TABLE "project_pm_assignment_notices" ADD CONSTRAINT "project_pm_assignment_notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pm_assignment_notices" ADD CONSTRAINT "project_pm_assignment_notices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
