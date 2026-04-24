-- CreateTable
CREATE TABLE "employee_change_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changedById" TEXT,
    "changedByRole" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_change_logs_employeeId_createdAt_idx" ON "employee_change_logs"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "employee_change_logs" ADD CONSTRAINT "employee_change_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_change_logs" ADD CONSTRAINT "employee_change_logs_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
