-- Add simple execution order column for tasks (per project/parent)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "task_order" INTEGER;

-- Optional index to speed up ordering/filtering by task_order within a project
CREATE INDEX IF NOT EXISTS "tasks_project_task_order_idx"
  ON "tasks"("projectId", "parentTaskId", "task_order");

