-- CreateEnum
CREATE TYPE "EngineeringDailyReportStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "engineering_daily_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "status" "EngineeringDailyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "roleSection" TEXT,
    "payload" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "token" TEXT NOT NULL,
    "reportId" TEXT,
    "dailyReportSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "engineering_daily_reports_userId_reportDate_key" ON "engineering_daily_reports"("userId", "reportDate");

-- CreateIndex
CREATE INDEX "engineering_daily_reports_userId_idx" ON "engineering_daily_reports"("userId");

-- CreateIndex
CREATE INDEX "engineering_daily_reports_reportDate_idx" ON "engineering_daily_reports"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_token_key" ON "checkout_sessions"("token");

-- CreateIndex
CREATE INDEX "checkout_sessions_userId_reportDate_idx" ON "checkout_sessions"("userId", "reportDate");

-- AddForeignKey
ALTER TABLE "engineering_daily_reports" ADD CONSTRAINT "engineering_daily_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "engineering_daily_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
