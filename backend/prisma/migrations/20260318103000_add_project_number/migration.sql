-- DropIndex
DROP INDEX IF EXISTS "tasks_predecessorId_idx";

-- DropIndex
DROP INDEX IF EXISTS "tasks_project_task_order_idx";

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "assignedmanageremail";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "projectNumber" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "projects_projectNumber_key" ON "projects"("projectNumber");

