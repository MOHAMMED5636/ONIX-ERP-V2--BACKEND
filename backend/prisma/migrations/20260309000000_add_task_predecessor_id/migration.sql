-- Add predecessorId for normalized task predecessor relation (strict sequencing)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "predecessorId" TEXT;

-- Add foreign key for self-relation: tasks.predecessorId -> tasks.id
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_predecessorId_fkey"
  FOREIGN KEY ("predecessorId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for predecessor lookups
CREATE INDEX IF NOT EXISTS "tasks_predecessorId_idx" ON "tasks"("predecessorId");
