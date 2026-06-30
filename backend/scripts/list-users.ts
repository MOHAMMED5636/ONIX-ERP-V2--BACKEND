/**
 * Print every ERP user (from PostgreSQL via Prisma).
 * Usage: npx ts-node scripts/list-users.ts
 * Requires DATABASE_URL in .env (or environment).
 */
import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      company: true,
      employeeId: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  console.log(JSON.stringify(users, null, 2));
  console.error(`\nTotal users: ${users.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
