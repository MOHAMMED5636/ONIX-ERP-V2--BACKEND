-- Contract phases selected in Contract Agreement (used as task categories on projects)
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "contractPhases" TEXT;
