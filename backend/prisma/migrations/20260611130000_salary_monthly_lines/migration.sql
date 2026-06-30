-- Monthly salary worksheet manual fields (OT, adjustments, paid salary).
CREATE TABLE "salary_monthly_lines" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "normalOtHours" DECIMAL(10,2),
    "specialOtHours" DECIMAL(10,2),
    "otherDeductions" DECIMAL(12,2),
    "adjustments" DECIMAL(12,2),
    "otherExpenses" DECIMAL(12,2),
    "paidSalary" DECIMAL(12,2),
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_monthly_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_monthly_lines_year_month_employeeId_key" ON "salary_monthly_lines"("year", "month", "employeeId");
CREATE INDEX "salary_monthly_lines_year_month_idx" ON "salary_monthly_lines"("year", "month");

ALTER TABLE "salary_monthly_lines" ADD CONSTRAINT "salary_monthly_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
