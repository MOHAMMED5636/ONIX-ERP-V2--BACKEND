-- Add undertaking letter fields to clients table
ALTER TABLE "clients"
ADD COLUMN IF NOT EXISTS "undertakingLetterPath" TEXT,
ADD COLUMN IF NOT EXISTS "undertakingLetterOriginalName" TEXT;

