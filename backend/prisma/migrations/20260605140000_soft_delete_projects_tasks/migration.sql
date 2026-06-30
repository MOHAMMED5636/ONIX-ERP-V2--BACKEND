-- Soft-delete support: restore deleted projects/tasks within 24 hours
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "projects_deletedAt_idx" ON "projects"("deletedAt");
CREATE INDEX IF NOT EXISTS "tasks_deletedAt_idx" ON "tasks"("deletedAt");
