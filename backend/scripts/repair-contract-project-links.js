const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.$executeRaw`
      UPDATE contracts c
      SET "projectId" = p.id
      FROM projects p
      WHERE c."projectId" IS NULL
        AND c."referenceNumber" = p."referenceNumber"
    `;
    console.log('Repaired rows:', count);
    const c = await prisma.contract.findFirst({
      where: { referenceNumber: '2583' },
      select: { referenceNumber: true, projectId: true },
    });
    console.log('Contract 2583:', c);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
