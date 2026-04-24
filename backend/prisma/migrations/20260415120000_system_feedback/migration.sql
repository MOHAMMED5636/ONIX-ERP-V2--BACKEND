-- CreateEnum
CREATE TYPE "SystemFeedbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "system_feedback" (
    "id" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT,
    "pageUrl" TEXT,
    "screenshotFilename" TEXT,
    "status" "SystemFeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "adminNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_feedback_submitterId_createdAt_idx" ON "system_feedback"("submitterId", "createdAt");

-- CreateIndex
CREATE INDEX "system_feedback_status_createdAt_idx" ON "system_feedback"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "system_feedback" ADD CONSTRAINT "system_feedback_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_feedback" ADD CONSTRAINT "system_feedback_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
