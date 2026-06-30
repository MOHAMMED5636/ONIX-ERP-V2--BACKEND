-- Workload Analytics Engine: additional algorithm settings
ALTER TABLE "organization_preferences"
  ADD COLUMN IF NOT EXISTS "workloadSubtaskCoefficient" DECIMAL(4, 2),
  ADD COLUMN IF NOT EXISTS "workloadDefaultPlannedDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "workloadEmployeeCapacity" DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS "workloadOverloadUtilizationPercent" DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS "workloadBalancedUtilizationMin" DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS "workloadAvailableUtilizationMax" DECIMAL(6, 2);
