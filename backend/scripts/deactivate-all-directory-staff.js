/**
 * Soft-deactivate every user who appears in the Employee Directory as "staff"
 * (same as clicking Delete on each row — sets isActive = false).
 *
 * Preserved (never updated): ADMIN, HR, TENDER_ENGINEER
 * Deactivated: EMPLOYEE, CONTRACTOR, MANAGER, PROJECT_MANAGER
 *
 * Usage (from backend folder, with DATABASE_URL set):
 *   node scripts/deactivate-all-directory-staff.js --dry-run
 *   node scripts/deactivate-all-directory-staff.js
 *
 * After this, use "Show inactive employees" in the Employee Directory UI to see
 * deactivated rows, or leave it off for an empty active list.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const ROLES_TO_DEACTIVATE = ['EMPLOYEE', 'CONTRACTOR', 'MANAGER', 'PROJECT_MANAGER'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();
  try {
    const targets = await prisma.user.findMany({
      where: {
        role: { in: ROLES_TO_DEACTIVATE },
        isActive: true,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    console.log(
      `Found ${targets.length} active user(s) with roles: ${ROLES_TO_DEACTIVATE.join(', ')}`
    );
    targets.forEach((u) =>
      console.log(`  - ${u.firstName} ${u.lastName} <${u.email}> [${u.role}]`)
    );

    if (dryRun) {
      console.log('Dry run — no changes.');
      return;
    }

    const result = await prisma.user.updateMany({
      where: {
        role: { in: ROLES_TO_DEACTIVATE },
        isActive: true,
      },
      data: { isActive: false },
    });

    console.log(
      `Deactivated ${result.count} user(s). ADMIN, HR, and TENDER_ENGINEER accounts were not modified.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
