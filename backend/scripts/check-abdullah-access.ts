import prisma from '../src/config/database';
import { resolveCompanyAccessScope } from '../src/services/companyAccess.service';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Abdullah', mode: 'insensitive' } },
        { lastName: { contains: 'Alakhras', mode: 'insensitive' } },
        { email: { contains: 'hr@onixgroup', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      company: true,
      companyLocation: true,
    },
  });
  console.log('users', JSON.stringify(users, null, 2));

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, tag: true },
  });
  console.log('companies', JSON.stringify(companies, null, 2));

  for (const u of users) {
    const scope = await resolveCompanyAccessScope(u.id, u.role);
    console.log('scope for', u.email, JSON.stringify(scope, null, 2));
    const grants = await prisma.userCompanyAccess.findMany({
      where: { userId: u.id },
      include: { company: { select: { name: true, tag: true } } },
    });
    console.log('grants', JSON.stringify(grants, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
