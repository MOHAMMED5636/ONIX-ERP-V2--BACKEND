import prisma from '../src/config/database';
import { resolveCompanyAccessScope } from '../src/services/companyAccess.service';

const ABDULLAH_EMAIL = 'hr@onixgroup.ae';
const DUBAI_TAG = 'ONIX DUBAI';
const ABU_DHABI_TAG = 'ONIX AD';

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: ABDULLAH_EMAIL, mode: 'insensitive' } },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    console.error('Abdullah (hr@onixgroup.ae) not found');
    process.exit(1);
  }

  const companies = await prisma.company.findMany({
    where: { tag: { in: [DUBAI_TAG, ABU_DHABI_TAG] } },
    select: { id: true, name: true, tag: true },
  });

  if (companies.length < 2) {
    console.error('Expected Dubai and Abu Dhabi companies; found:', companies);
    process.exit(1);
  }

  for (const c of companies) {
    await prisma.userCompanyAccess.upsert({
      where: {
        userId_companyId: { userId: user.id, companyId: c.id },
      },
      create: {
        userId: user.id,
        companyId: c.id,
      },
      update: {},
    });
    console.log('Granted:', c.tag, c.name);
  }

  const scope = await resolveCompanyAccessScope(user.id, user.role);
  console.log('Final scope:', JSON.stringify(scope, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
