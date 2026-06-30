import prisma from '../src/config/database';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Pauline', mode: 'insensitive' } },
        { email: { contains: 'pauline', mode: 'insensitive' } },
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
    select: { id: true, name: true, tag: true, branchName: true, address: true },
  });
  console.log('companies', JSON.stringify(companies, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
