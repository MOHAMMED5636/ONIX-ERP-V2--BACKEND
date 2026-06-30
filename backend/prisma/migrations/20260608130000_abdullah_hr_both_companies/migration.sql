-- Abdullah (HR): assigned to Dubai + Abu Dhabi branches
INSERT INTO "user_company_access" ("id", "userId", "companyId", "createdAt")
SELECT
  'abdullah-dubai-access-001',
  u.id,
  c.id,
  CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "companies" c
WHERE lower(u.email) = lower('hr@onixgroup.ae')
  AND c.tag = 'ONIX DUBAI'
ON CONFLICT ("userId", "companyId") DO NOTHING;

INSERT INTO "user_company_access" ("id", "userId", "companyId", "createdAt")
SELECT
  'abdullah-abudhabi-access-001',
  u.id,
  c.id,
  CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "companies" c
WHERE lower(u.email) = lower('hr@onixgroup.ae')
  AND c.tag = 'ONIX AD'
ON CONFLICT ("userId", "companyId") DO NOTHING;
