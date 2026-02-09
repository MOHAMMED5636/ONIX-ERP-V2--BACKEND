-- AlterTable: Add location and project detail fields to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "makaniNumber" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "plotNumber" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "community" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "projectType" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "projectFloor" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "developerProject" TEXT;
