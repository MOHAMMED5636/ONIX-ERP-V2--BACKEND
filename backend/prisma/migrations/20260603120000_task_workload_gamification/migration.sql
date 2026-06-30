-- Task effort type + weight for workload scoring
CREATE TYPE "TaskEffortType" AS ENUM ('FULL_FOCUS', 'MONITORING');

ALTER TABLE "tasks" ADD COLUMN "effortType" "TaskEffortType" NOT NULL DEFAULT 'FULL_FOCUS';
ALTER TABLE "tasks" ADD COLUMN "taskWeight" INTEGER NOT NULL DEFAULT 3;

-- Gamification on users
ALTER TABLE "users" ADD COLUMN "totalXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "starCount" INTEGER NOT NULL DEFAULT 0;

-- Workload algorithm tuning (organization singleton)
ALTER TABLE "organization_preferences" ADD COLUMN "workloadMonitoringCoefficient" DECIMAL(4,2);
ALTER TABLE "organization_preferences" ADD COLUMN "workloadOverloadThreshold" DECIMAL(6,2);
ALTER TABLE "organization_preferences" ADD COLUMN "workloadBalancedMin" DECIMAL(6,2);
ALTER TABLE "organization_preferences" ADD COLUMN "workloadAvailableMax" DECIMAL(6,2);
