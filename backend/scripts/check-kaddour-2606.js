const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { contains: 'kaddour', mode: 'insensitive' } },
          { firstName: { contains: 'kaddour', mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    console.log('user', user);
    if (!user) return;

    for (const ref of ['2606', '2604', '2583']) {
      const proj = await prisma.project.findFirst({
        where: { OR: [{ referenceNumber: ref }, { referenceNumber: { contains: ref } }] },
        select: {
          id: true,
          referenceNumber: true,
          projectManager: true,
          createdBy: true,
          name: true,
          contracts: {
            select: {
              id: true,
              referenceNumber: true,
              assignedManagerId: true,
              assignedManagerEmail: true,
              projectId: true,
            },
          },
        },
      });
      console.log(`\nproject ${ref}:`, JSON.stringify(proj, null, 2));
    }

    const contracts = await prisma.contract.findMany({
      where: {
        OR: [
          { assignedManagerId: user.id },
          { assignedManagerEmail: user.email },
          { referenceNumber: { contains: '2606' } },
        ],
      },
      select: {
        id: true,
        referenceNumber: true,
        assignedManagerId: true,
        assignedManagerEmail: true,
        projectId: true,
        status: true,
      },
      take: 20,
    });
    console.log('\nKaddour-related contracts:', JSON.stringify(contracts, null, 2));

    const pendingForKaddour = await prisma.contract.findMany({
      where: {
        projectId: null,
        OR: [{ assignedManagerId: user.id }, { assignedManagerEmail: user.email }],
      },
      select: { id: true, referenceNumber: true, assignedManagerId: true, assignedManagerEmail: true },
    });
    console.log('\nPending load-out for Kaddour:', pendingForKaddour);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
