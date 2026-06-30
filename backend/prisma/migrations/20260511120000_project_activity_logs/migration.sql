-- Project-level activity feed (subtasks, assignments, comments, etc.) for the project drawer "History" tab.

CREATE TABLE "project_activity_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "taskId" TEXT,
    "summary" VARCHAR(600) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_activity_logs_projectId_createdAt_idx" ON "project_activity_logs"("projectId", "createdAt" DESC);

ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
