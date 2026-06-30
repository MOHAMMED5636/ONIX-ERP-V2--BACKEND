-- Critical Reminder Alarm System: alarm instances + audit logs

CREATE TABLE "task_reminder_alerts" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntil" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "managerNotifiedAt" TIMESTAMP(3),
    "ignoredLoggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_reminder_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_reminder_alerts_userId_status_idx" ON "task_reminder_alerts"("userId", "status");
CREATE INDEX "task_reminder_alerts_status_lastFiredAt_idx" ON "task_reminder_alerts"("status", "lastFiredAt");
CREATE INDEX "task_reminder_alerts_reminderId_idx" ON "task_reminder_alerts"("reminderId");

ALTER TABLE "task_reminder_alerts"
    ADD CONSTRAINT "task_reminder_alerts_reminderId_fkey"
    FOREIGN KEY ("reminderId") REFERENCES "task_reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "task_reminder_action_logs" (
    "id" TEXT NOT NULL,
    "alertId" TEXT,
    "reminderId" TEXT,
    "taskId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reminder_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_reminder_action_logs_alertId_createdAt_idx" ON "task_reminder_action_logs"("alertId", "createdAt");
CREATE INDEX "task_reminder_action_logs_reminderId_createdAt_idx" ON "task_reminder_action_logs"("reminderId", "createdAt");
