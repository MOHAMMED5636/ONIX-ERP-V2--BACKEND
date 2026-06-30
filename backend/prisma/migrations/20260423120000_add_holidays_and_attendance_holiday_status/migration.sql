-- This migration folder existed without a migration.sql, which breaks `prisma migrate dev`
-- because Prisma needs to replay all migrations into the shadow database.
--
-- The holiday-related schema changes were reverted/removed from the current `schema.prisma`,
-- so this migration is intentionally a no-op.

