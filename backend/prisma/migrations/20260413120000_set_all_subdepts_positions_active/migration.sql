-- Set every sub-department and position to ACTIVE (one-time data fix / bulk enable).

UPDATE "sub_departments"
SET "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS DISTINCT FROM 'ACTIVE';

UPDATE "positions"
SET "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS DISTINCT FROM 'ACTIVE';
