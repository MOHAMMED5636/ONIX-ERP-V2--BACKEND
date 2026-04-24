-- Expand client representative details (person/company + additional info + company info)
ALTER TABLE "clients"
ADD COLUMN IF NOT EXISTS "representativeType" TEXT,
ADD COLUMN IF NOT EXISTS "representativeLeadSource" TEXT,
ADD COLUMN IF NOT EXISTS "representativeRank" TEXT,
ADD COLUMN IF NOT EXISTS "representativeAddress" TEXT,
ADD COLUMN IF NOT EXISTS "representativeIdExpiryDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "representativePassportNumber" TEXT,
ADD COLUMN IF NOT EXISTS "representativeBirthDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "representativeCorporateName" TEXT,
ADD COLUMN IF NOT EXISTS "representativeWebsite" TEXT,
ADD COLUMN IF NOT EXISTS "representativeLicenseNumber" TEXT,
ADD COLUMN IF NOT EXISTS "representativeCompanyAddress" TEXT,
ADD COLUMN IF NOT EXISTS "representativeCompanyDescription" TEXT,
ADD COLUMN IF NOT EXISTS "representativeTrnNumber" TEXT,
ADD COLUMN IF NOT EXISTS "representativeIbanNumber" TEXT;

