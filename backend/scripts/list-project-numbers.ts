import prisma from '../src/config/database';

async function main() {
  const rows = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, projectNumber: true, referenceNumber: true, name: true },
    orderBy: { projectNumber: 'desc' },
    take: 30,
  });
  console.log('Projects:', rows.length);
  for (const r of rows) {
    const taskCount = await prisma.task.count({
      where: { projectId: r.id, parentTaskId: null, deletedAt: null },
    });
    console.log(`  #${r.projectNumber} ref=${r.referenceNumber} tasks=${taskCount} ${r.name?.slice(0, 40)}`);
  }
}

main().finally(() => prisma.$disconnect());
