-- Add representative fields to clients table
ALTER TABLE "clients"
ADD COLUMN IF NOT EXISTS "representativeName" TEXT,
ADD COLUMN IF NOT EXISTS "representativeEmail" TEXT,
ADD COLUMN IF NOT EXISTS "representativePhone" TEXT,
ADD COLUMN IF NOT EXISTS "representativeNationality" TEXT,
ADD COLUMN IF NOT EXISTS "representativeIdNumber" TEXT,
ADD COLUMN IF NOT EXISTS "representativePowerOfAttorneyPath" TEXT,
ADD COLUMN IF NOT EXISTS "representativePowerOfAttorneyOriginalName" TEXT;

