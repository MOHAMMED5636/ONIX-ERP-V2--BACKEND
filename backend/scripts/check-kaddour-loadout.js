const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { email: 'kaddour@onixgroup.ae' } });
    const contracts = await prisma.contract.findMany({
      where: {
        AND: [
          {
            OR: [
              { assignedManagerId: user.id },
              { assignedManagerEmail: user.email },
            ],
          },
          {
            OR: [
              { projectId: null },
              { project: { deletedAt: { not: null } } },
            ],
          },
        ],
      },
      include: { project: { select: { referenceNumber: true, deletedAt: true } } },
    });
    console.log('Load-out eligible contracts for Kaddour:', contracts.map((c) => ({
      ref: c.referenceNumber,
      projectId: c.projectId,
      projectDeleted: c.project?.deletedAt,
    })));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
