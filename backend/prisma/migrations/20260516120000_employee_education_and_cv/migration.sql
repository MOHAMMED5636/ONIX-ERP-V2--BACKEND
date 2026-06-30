-- Educational qualification (free text) and curriculum vitae document
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "educationalQualification" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "curriculumVitaeAttachment" TEXT;
