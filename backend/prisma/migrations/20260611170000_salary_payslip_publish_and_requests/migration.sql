-- Publish monthly salary lines to employees + payslip dispute requests

ALTER TABLE "salary_monthly_lines" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "salary_monthly_lines" ADD COLUMN "publishedById" TEXT;

CREATE TYPE "SalaryPayslipRequestStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

CREATE TABLE "salary_payslip_requests" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SalaryPayslipRequestStatus" NOT NULL DEFAULT 'OPEN',
    "hrResponse" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_payslip_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salary_payslip_requests_year_month_idx" ON "salary_payslip_requests"("year", "month");
CREATE INDEX "salary_payslip_requests_employeeId_idx" ON "salary_payslip_requests"("employeeId");
CREATE INDEX "salary_payslip_requests_status_idx" ON "salary_payslip_requests"("status");

ALTER TABLE "salary_payslip_requests" ADD CONSTRAINT "salary_payslip_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
