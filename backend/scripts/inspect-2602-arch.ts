import prisma from '../src/config/database';

async function main() {
  const p = await prisma.project.findFirst({ where: { referenceNumber: '2602' } });
  if (!p) return;
  const arch = await prisma.task.findMany({
    where: { projectId: p.id, title: { contains: 'ARCH - SHOP' } },
    include: {
      subtasks: { select: { id: true, title: true, stableWorkSeq: true, taskOrder: true } },
    },
    orderBy: { stableWorkSeq: 'asc' },
  });
  console.log(JSON.stringify(arch, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
