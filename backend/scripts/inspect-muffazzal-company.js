const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: 'mufa', mode: 'insensitive' } },
          { lastName: { contains: 'mufa', mode: 'insensitive' } },
          { email: { contains: 'mufa', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        companyLocation: true,
        role: true,
      },
    });
    console.log('users:', users);

    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: 'onix', mode: 'insensitive' } },
          { branchName: { contains: 'dubai', mode: 'insensitive' } },
          { address: { contains: 'dubai', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        tag: true,
        branchName: true,
        address: true,
        parentCompanyId: true,
      },
      orderBy: { name: 'asc' },
    });
    console.log('companies:', companies);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
