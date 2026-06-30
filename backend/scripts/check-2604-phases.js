const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const ref of ['2604', '2539', '2583']) {
      const proj = await prisma.project.findFirst({
        where: { referenceNumber: ref, deletedAt: null },
        select: {
          id: true,
          referenceNumber: true,
          contracts: {
            select: { referenceNumber: true, contractPhases: true },
          },
          tasks: {
            where: { deletedAt: null, parentTaskId: null },
            select: { title: true, category: true, status: true },
            take: 15,
          },
        },
      });
      console.log(`\n=== Project ${ref} ===`);
      console.log('contractPhases:', proj?.contracts?.[0]?.contractPhases);
      console.log('top tasks categories:', proj?.tasks?.map((t) => ({ title: t.title?.slice(0, 40), category: t.category, status: t.status })));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
