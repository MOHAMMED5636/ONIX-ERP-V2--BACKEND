-- Additional org-chart placements without changing users.primary department/position/jobTitle
CREATE TABLE "employee_position_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "employee_position_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_position_assignments_userId_positionId_key" ON "employee_position_assignments"("userId", "positionId");

CREATE INDEX "employee_position_assignments_positionId_idx" ON "employee_position_assignments"("positionId");

ALTER TABLE "employee_position_assignments" ADD CONSTRAINT "employee_position_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_position_assignments" ADD CONSTRAINT "employee_position_assignments_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_position_assignments" ADD CONSTRAINT "employee_position_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
