-- Add parentTaskId for hierarchical task structure (Task -> SubTask -> ChildTask)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "parentTaskId" TEXT;

-- Add foreign key constraint for parentTaskId (self-relation)
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey" 
  FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add additional fields for subtasks/child tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "planDays" INTEGER;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assigneeNotes" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "makaniNumber" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "plotNumber" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "community" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "projectType" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "projectFloor" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "developerProject" TEXT;

-- Create index for better query performance on parentTaskId
CREATE INDEX IF NOT EXISTS "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");
CREATE INDEX IF NOT EXISTS "tasks_projectId_parentTaskId_idx" ON "tasks"("projectId", "parentTaskId");
