const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'kaddour@onixgroup.ae' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) return;

    const proj2606 = await prisma.project.findFirst({
      where: { referenceNumber: '2606' },
      select: { id: true, referenceNumber: true, deletedAt: true, createdBy: true, projectManager: true },
    });
    console.log('project 2606 row:', proj2606);

    const contract2606 = await prisma.contract.findFirst({
      where: { referenceNumber: '2606' },
      select: { assignedManagerId: true, assignedManagerEmail: true, projectId: true },
    });
    console.log('contract 2606 row:', contract2606);

    const projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        OR: [
          { contracts: { some: { assignedManagerId: user.id } } },
          { contracts: { some: { assignedManagerEmail: user.email } } },
        ],
      },
      select: {
        id: true,
        referenceNumber: true,
        projectManager: true,
        deletedAt: true,
        _count: { select: { tasks: true } },
      },
      orderBy: { projectNumber: 'asc' },
    });
    console.log('Projects via contract PM filter:', projects);

    const allKaddour = await prisma.project.findMany({
      where: { deletedAt: null, createdBy: user.id },
      select: { referenceNumber: true, projectManager: true },
    });
    console.log('Projects createdBy Kaddour:', allKaddour);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
