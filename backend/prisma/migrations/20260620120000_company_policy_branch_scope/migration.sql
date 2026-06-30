-- Add optional company/branch scope for company policies
ALTER TABLE "company_policies" ADD COLUMN "companyId" TEXT;

CREATE INDEX "company_policies_companyId_idx" ON "company_policies"("companyId");

ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
