-- Revoke ERP access for seed user kaddour@onixgroup.ae (no longer allowed to log in).
UPDATE "users"
SET
  "isActive" = false,
  "userAccount" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER(email) = LOWER('kaddour@onixgroup.ae');
