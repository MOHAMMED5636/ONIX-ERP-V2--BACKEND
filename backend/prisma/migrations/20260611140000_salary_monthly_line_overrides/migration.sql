-- Manual worksheet overrides for total salary and attendance rollup columns.
ALTER TABLE "salary_monthly_lines" ADD COLUMN "totalSalary" DECIMAL(12,2);
ALTER TABLE "salary_monthly_lines" ADD COLUMN "realWorkingDays" INTEGER;
ALTER TABLE "salary_monthly_lines" ADD COLUMN "unexcusedAbsenceDays" INTEGER;
ALTER TABLE "salary_monthly_lines" ADD COLUMN "lateHours" DECIMAL(10,2);
