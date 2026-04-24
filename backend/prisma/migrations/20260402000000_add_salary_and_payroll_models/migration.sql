-- ============================================
-- Salary Management + Payroll Processing
-- Models added from updated prisma/schema.prisma
-- ============================================

-- CreateEnum
CREATE TYPE "SalaryAllowanceType" AS ENUM ('HRA', 'TRAVEL', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryDeductionType" AS ENUM ('LEAVE', 'LATE_PENALTY', 'LOAN', 'OTHER_MANUAL');

-- CreateEnum
CREATE TYPE "SalaryDeductionMode" AS ENUM ('FIXED', 'PER_DAY', 'PER_MINUTE', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "SalaryIncrementType" AS ENUM ('MONTHLY', 'YEARLY', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ADD_ALLOWANCE', 'ADD_DEDUCTION', 'ADD_INCREMENT');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'HR_PENDING', 'HR_APPROVED', 'FINANCE_PENDING', 'FINANCE_APPROVED', 'FINAL_APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayrollApprovalStage" AS ENUM ('HR_REVIEW', 'FINANCE_REVIEW', 'FINAL_APPROVAL');

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "basicSalary" DECIMAL(12,2),
    "perHourRate" DECIMAL(12,2),
    "contractSalaryAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_allowances" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "allowanceType" "SalaryAllowanceType" NOT NULL,
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_deductions" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "deductionType" "SalaryDeductionType" NOT NULL,
    "mode" "SalaryDeductionMode" NOT NULL DEFAULT 'FIXED',
    "value" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_increment_history" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "incrementType" "SalaryIncrementType" NOT NULL,
    "amount" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_increment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_audit_logs" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT,
    "action" "SalaryAuditAction" NOT NULL,
    "details" JSONB,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL,
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
    "lateDeductionPerMinute" DECIMAL(10,2) NOT NULL DEFAULT 0.5,
    "absenceDeductionType" TEXT NOT NULL DEFAULT 'DAILY',
    "absenceDeductionValue" DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    "unpaidLeaveDeductionType" TEXT NOT NULL DEFAULT 'DAILY',
    "unpaidLeaveDeductionValue" DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,

    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(12,2) NOT NULL DEFAULT 0,

    "hrApprovedById" TEXT,
    "hrApprovedAt" TIMESTAMP(3),
    "financeApprovedById" TEXT,
    "financeApprovedAt" TIMESTAMP(3),
    "finalApprovedById" TEXT,
    "finalApprovedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),

    "settingsSnapshot" JSONB,

    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    "snapshotEmployeeId" TEXT,
    "snapshotBasicSalary" DECIMAL(12,2) NOT NULL,
    "snapshotAllowance1" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "snapshotAllowance2" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "snapshotTotalAllowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "snapshotDepartment" TEXT,

    "grossSalary" DECIMAL(12,2) NOT NULL,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(12,2) NOT NULL,

    "totalWorkingDays" INTEGER NOT NULL DEFAULT 0,
    "totalAbsentDays" INTEGER NOT NULL DEFAULT 0,
    "totalLateInstances" INTEGER NOT NULL DEFAULT 0,
    "totalLateMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalEarlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,

    "paidLeaveDays" INTEGER NOT NULL DEFAULT 0,
    "unpaidLeaveDays" INTEGER NOT NULL DEFAULT 0,

    "absenceDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lateDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unpaidLeaveDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "manualAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentNotes" TEXT,

    "payslipGenerated" BOOLEAN NOT NULL DEFAULT false,
    "payslipGeneratedAt" TIMESTAMP(3),
    "payslipPath" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_approvals" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "stage" "PayrollApprovalStage" NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "comments" TEXT,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_audit_logs" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedById" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_employeeId_effectiveFrom_key" ON "salary_structures"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "salary_structures_employeeId_effectiveFrom_idx" ON "salary_structures"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "salary_allowances_salaryStructureId_idx" ON "salary_allowances"("salaryStructureId");

-- CreateIndex
CREATE INDEX "salary_deductions_salaryStructureId_idx" ON "salary_deductions"("salaryStructureId");

-- CreateIndex
CREATE INDEX "salary_increment_history_salaryStructureId_effectiveDate_idx" ON "salary_increment_history"("salaryStructureId", "effectiveDate");

-- CreateIndex
CREATE INDEX "salary_audit_logs_createdAt_idx" ON "salary_audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_periodMonth_periodYear_key" ON "payroll_runs"("periodMonth", "periodYear");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE INDEX "payroll_runs_periodYear_periodMonth_idx" ON "payroll_runs"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "payroll_lines_employeeId_idx" ON "payroll_lines"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_lines_payrollRunId_idx" ON "payroll_lines"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_payrollRunId_employeeId_key" ON "payroll_lines"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "payroll_approvals_payrollRunId_idx" ON "payroll_approvals"("payrollRunId");

-- CreateIndex
CREATE INDEX "payroll_approvals_stage_idx" ON "payroll_approvals"("stage");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_payrollRunId_idx" ON "payroll_audit_logs"("payrollRunId");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_action_idx" ON "payroll_audit_logs"("action");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_allowances" ADD CONSTRAINT "salary_allowances_salaryStructureId_fkey"
FOREIGN KEY ("salaryStructureId") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_deductions" ADD CONSTRAINT "salary_deductions_salaryStructureId_fkey"
FOREIGN KEY ("salaryStructureId") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_increment_history" ADD CONSTRAINT "salary_increment_history_salaryStructureId_fkey"
FOREIGN KEY ("salaryStructureId") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_audit_logs" ADD CONSTRAINT "salary_audit_logs_salaryStructureId_fkey"
FOREIGN KEY ("salaryStructureId") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_audit_logs" ADD CONSTRAINT "salary_audit_logs_performedById_fkey"
FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_hrApprovedById_fkey"
FOREIGN KEY ("hrApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_financeApprovedById_fkey"
FOREIGN KEY ("financeApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalApprovedById_fkey"
FOREIGN KEY ("finalApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payrollRunId_fkey"
FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_approvals" ADD CONSTRAINT "payroll_approvals_payrollRunId_fkey"
FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_approvals" ADD CONSTRAINT "payroll_approvals_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audit_logs" ADD CONSTRAINT "payroll_audit_logs_payrollRunId_fkey"
FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audit_logs" ADD CONSTRAINT "payroll_audit_logs_performedById_fkey"
FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

