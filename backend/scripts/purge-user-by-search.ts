/**
 * Find users by name (case-insensitive) and permanently delete them (same cleanup as HR permanent delete).
 *
 * Usage (list only):
 *   npx ts-node scripts/purge-user-by-search.ts --first=Pauline
 *
 * Permanent delete (requires --yes):
 *   npx ts-node scripts/purge-user-by-search.ts --first=Pauline --last=Paraiso --yes
 *
 * Or by email (delegates to purge-users-by-email):
 *   npx ts-node scripts/purge-users-by-email.ts user@company.com
 */
import 'dotenv/config';
import prisma from '../src/config/database';
import { permanentlyDeleteUser } from '../src/services/employeePermanentDelete.service';

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`${name}=`));
  return p ? p.slice(name.length + 1).trim() : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const first = arg('--first');
  const last = arg('--last');
  const email = arg('--email');

  if (email) {
    const u = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (!u) {
      console.log('No user with that email.');
      process.exit(0);
    }
    console.log('Match:', u);
    if (!hasFlag('--yes')) {
      console.error('Add --yes to permanently delete this user.');
      process.exit(1);
    }
    await permanentlyDeleteUser(u.id);
    console.log('Deleted:', u.email);
    process.exit(0);
  }

  if (!first && !last) {
    console.error(
      'Usage:\n  npx ts-node scripts/purge-user-by-search.ts --first=Pauline [--last=Paraiso] [--yes]\n' +
        '  npx ts-node scripts/purge-user-by-search.ts --email=user@x.com --yes',
    );
    process.exit(1);
  }

  const where: any = {
    AND: [] as any[],
  };
  if (first) {
    where.AND.push({ firstName: { contains: first, mode: 'insensitive' } });
  }
  if (last) {
    where.AND.push({ lastName: { contains: last, mode: 'insensitive' } });
  }

  const matches = await prisma.user.findMany({
    where,
    select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  if (matches.length === 0) {
    console.log('No users matched.');
    process.exit(0);
  }

  console.log(`Found ${matches.length} user(s):`);
  for (const m of matches) {
    console.log(`  - ${m.id}  ${m.firstName} ${m.lastName}  <${m.email}>  role=${m.role} active=${m.isActive}`);
  }

  if (!hasFlag('--yes')) {
    console.error('\nReview the list above. Re-run with --yes to permanently delete every matched user.');
    process.exit(1);
  }

  for (const m of matches) {
    try {
      await permanentlyDeleteUser(m.id);
      console.log(`Deleted: ${m.email}`);
    } catch (e) {
      console.error(`FAILED ${m.email}:`, e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
