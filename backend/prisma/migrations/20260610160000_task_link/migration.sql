-- Persist subtask/child-task link URLs entered in the Main Table LINK column

ALTER TABLE "tasks" ADD COLUMN "link" VARCHAR(2048);
