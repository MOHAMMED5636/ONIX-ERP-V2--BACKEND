const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe('ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "parentCompanyId" TEXT');

    // Add FK constraint if missing (Postgres-safe)
    await p.$executeRawUnsafe(`
DO $$
BEGIN
  ALTER TABLE "companies"
  ADD CONSTRAINT "companies_parentCompanyId_fkey"
  FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
    `);

    await p.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "companies_parentCompanyId_idx" ON "companies"("parentCompanyId")'
    );

    console.log('OK: parentCompanyId TEXT + FK + index applied');
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

