-- Permanent per-(project, parent) work sequence for AUTO # suffixes (gaps allowed after delete).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "stable_work_seq" INTEGER;

UPDATE "tasks" AS t
SET "stable_work_seq" = r.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "projectId", "parentTaskId"
      ORDER BY "task_order" NULLS LAST, "createdAt" ASC, id ASC
    ) AS rn
  FROM "tasks"
) AS r
WHERE t.id = r.id AND t."stable_work_seq" IS NULL;
