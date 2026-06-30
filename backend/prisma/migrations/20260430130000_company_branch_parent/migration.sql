-- Add parent company relationship (branch support)
ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "parentCompanyId" UUID;

ALTER TABLE "companies"
ADD CONSTRAINT "companies_parentCompanyId_fkey"
FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "companies_parentCompanyId_idx" ON "companies"("parentCompanyId");

