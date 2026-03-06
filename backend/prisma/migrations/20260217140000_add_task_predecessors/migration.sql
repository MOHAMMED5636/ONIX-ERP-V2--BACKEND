-- AlterTable
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "predecessors" VARCHAR(500);
