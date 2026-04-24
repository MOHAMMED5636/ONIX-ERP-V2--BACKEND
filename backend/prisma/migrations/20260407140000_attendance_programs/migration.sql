-- CreateTable
CREATE TABLE "attendance_programs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weeklySchedule" JSONB NOT NULL,
    "hoursSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_programs_companyId_name_key" ON "attendance_programs"("companyId", "name");

-- CreateIndex
CREATE INDEX "attendance_programs_companyId_idx" ON "attendance_programs"("companyId");

-- AddForeignKey
ALTER TABLE "attendance_programs" ADD CONSTRAINT "attendance_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
