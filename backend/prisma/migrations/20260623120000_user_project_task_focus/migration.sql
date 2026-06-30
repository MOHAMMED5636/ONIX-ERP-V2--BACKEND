-- CreateTable
CREATE TABLE "user_project_task_focus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "selectedTaskId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_project_task_focus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_project_task_focus_userId_projectId_key" ON "user_project_task_focus"("userId", "projectId");

-- CreateIndex
CREATE INDEX "user_project_task_focus_userId_idx" ON "user_project_task_focus"("userId");

-- CreateIndex
CREATE INDEX "user_project_task_focus_projectId_idx" ON "user_project_task_focus"("projectId");

-- AddForeignKey
ALTER TABLE "user_project_task_focus" ADD CONSTRAINT "user_project_task_focus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_task_focus" ADD CONSTRAINT "user_project_task_focus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_task_focus" ADD CONSTRAINT "user_project_task_focus_selectedTaskId_fkey" FOREIGN KEY ("selectedTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
