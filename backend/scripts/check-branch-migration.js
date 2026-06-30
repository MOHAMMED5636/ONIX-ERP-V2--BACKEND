const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  try {
    const migration = await p.$queryRawUnsafe(
      "SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs FROM _prisma_migrations WHERE migration_name='20260430130000_company_branch_parent'"
    );

    const col = await p.$queryRawUnsafe(
      "SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_name='companies' AND column_name='parentCompanyId'"
    );
    const fk = await p.$queryRawUnsafe(
      "SELECT conname, contype FROM pg_constraint WHERE conrelid='companies'::regclass AND conname='companies_parentCompanyId_fkey'"
    );
    const idx = await p.$queryRawUnsafe(
      "SELECT indexname FROM pg_indexes WHERE tablename='companies' AND indexname='companies_parentCompanyId_idx'"
    );

    console.log(JSON.stringify({ migration, col, fk, idx }, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

