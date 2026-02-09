-- AlterTable: Change projectManager from foreign key relation to plain text field
-- Step 1: Drop the foreign key constraint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_projectManagerId_fkey";

-- Step 2: Drop the old projectManagerId column
ALTER TABLE "projects" DROP COLUMN IF EXISTS "projectManagerId";

-- Step 3: Add new projectManager text column (if it doesn't exist)
-- Note: If projectManager column already exists from a previous migration, this will be skipped
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'projectManager'
    ) THEN
        ALTER TABLE "projects" ADD COLUMN "projectManager" VARCHAR(100);
    END IF;
END $$;

-- Step 4: Migrate existing data (if any projectManagerId values exist, they would need manual migration)
-- Since we're changing to free text, existing foreign key relationships are lost
-- This is intentional - projectManager is now a free-text field
