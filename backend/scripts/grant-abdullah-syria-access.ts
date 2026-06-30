import prisma from '../src/config/database';
import {
  grantCompanyAccessForOrgPosition,
  resolveCompanyAccessScope,
} from '../src/services/companyAccess.service';

const ABDULLAH_EMAIL = 'hr@onixgroup.ae';

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: ABDULLAH_EMAIL, mode: 'insensitive' } },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    console.error('Abdullah not found');
    process.exit(1);
  }

  const syria = await prisma.company.findFirst({
    where: { name: { contains: 'SYRIA', mode: 'insensitive' } },
    select: { id: true, name: true, tag: true },
  });
  if (!syria) {
    console.error('Syria company not found');
    process.exit(1);
  }

  const assignments = await prisma.employeePositionAssignment.findMany({
    where: { userId: user.id },
    select: {
      positionId: true,
      position: {
        select: {
          name: true,
          subDepartment: {
            select: {
              department: { select: { company: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  console.log('Org position assignments:', JSON.stringify(assignments, null, 2));

  for (const a of assignments) {
    const companyName = a.position?.subDepartment?.department?.company?.name ?? '';
    if (/syria/i.test(companyName)) {
      await grantCompanyAccessForOrgPosition(user.id, a.positionId, null);
      console.log('Granted via org position:', a.position?.name, companyName);
    }
  }

  await prisma.userCompanyAccess.upsert({
    where: { userId_companyId: { userId: user.id, companyId: syria.id } },
    create: { userId: user.id, companyId: syria.id },
    update: {},
  });
  console.log('Granted explicit access:', syria.name);

  const scope = await resolveCompanyAccessScope(user.id, user.role);
  console.log(
    'Companies visible:',
    scope.companies.map((c) => c.name),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
