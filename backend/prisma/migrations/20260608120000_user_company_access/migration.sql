-- Admin/HR multi-company access control
CREATE TABLE "user_company_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_company_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_company_access_userId_companyId_key" ON "user_company_access"("userId", "companyId");
CREATE INDEX "user_company_access_userId_idx" ON "user_company_access"("userId");
CREATE INDEX "user_company_access_companyId_idx" ON "user_company_access"("companyId");

ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pauline (Admin): explicit Dubai branch access
INSERT INTO "user_company_access" ("id", "userId", "companyId", "createdAt")
SELECT
  'pauline-dubai-access-001',
  u.id,
  c.id,
  CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "companies" c
WHERE lower(u.email) = lower('info@onixgroup.ae')
  AND c.tag = 'ONIX DUBAI'
ON CONFLICT ("userId", "companyId") DO NOTHING;
