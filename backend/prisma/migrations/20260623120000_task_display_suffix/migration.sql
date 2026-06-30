-- Insert-between display keys (e.g. 4-2A) separate from internal stable_work_seq.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "display_anchor_seq" INTEGER;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "display_suffix" VARCHAR(8);
