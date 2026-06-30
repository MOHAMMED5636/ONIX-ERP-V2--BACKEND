import prisma from '../src/config/database';
import { employeeCompanyCompatibleWithPositionCompany } from '../src/services/companyAccess.service';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'hr@onixgroup', mode: 'insensitive' } },
        { lastName: { contains: 'Alakhras', mode: 'insensitive' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, company: true, email: true },
  });
  console.log('USER:', JSON.stringify(users, null, 2));

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      branchName: true,
      parentCompanyId: true,
      parentCompany: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });
  console.log('ALL COMPANIES:', JSON.stringify(companies, null, 2));

  const user = users[0];
  if (!user) {
    console.log('No user found');
    return;
  }

  for (const c of companies) {
    const ok = await employeeCompanyCompatibleWithPositionCompany(user.company || '', c.name);
    console.log(`compatible "${user.company}" -> "${c.name}":`, ok);
  }

  // Sample positions under syria-like companies
  const positions = await prisma.position.findMany({
    where: {
      subDepartment: {
        department: {
          company: {
            OR: [
              { name: { contains: 'SYR', mode: 'insensitive' } },
              { branchName: { contains: 'Syria', mode: 'insensitive' } },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      subDepartment: {
        select: {
          name: true,
          department: {
            select: {
              name: true,
              company: { select: { id: true, name: true, parentCompanyId: true } },
            },
          },
        },
      },
    },
    take: 10,
  });
  console.log('SYRIA POSITIONS:', JSON.stringify(positions, null, 2));

  for (const p of positions) {
    const companyName = p.subDepartment?.department?.company?.name ?? '';
    const ok = await employeeCompanyCompatibleWithPositionCompany(user.company || '', companyName);
    console.log(`position "${p.name}" company "${companyName}":`, ok);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
