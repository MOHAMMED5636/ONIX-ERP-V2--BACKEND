-- DropIndex
DROP INDEX "tasks_predecessorId_idx";

-- DropIndex
DROP INDEX "tasks_project_task_order_idx";

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "assignedmanageremail";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "projectNumber" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "projects_projectNumber_key" ON "projects"("projectNumber");

