/**
 * One-time cleanup: remove display suffixes wrongly applied to normal sequential tasks.
 * Run: npx tsx scripts/repair-all-display-keys.ts
 */
import prisma from '../src/config/database';
import { repairInsertedTaskDisplayKeys } from '../src/utils/task-display-key';

async function main() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, referenceNumber: true, projectNumber: true },
  });

  let total = 0;
  for (const p of projects) {
    const fixed = await repairInsertedTaskDisplayKeys(prisma, p.id, null);
    if (fixed > 0) {
      console.log(
        `Project ${p.referenceNumber ?? p.projectNumber}: repaired ${fixed} row(s)`,
      );
      total += fixed;
    }
  }
  console.log(`Done. Total rows updated: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
