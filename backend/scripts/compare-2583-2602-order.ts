import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  for (const ref of ['2583', '2602']) {
    const p = await prisma.project.findFirst({ where: { referenceNumber: ref } });
    if (!p) {
      console.log(`\n${ref}: NOT FOUND`);
      continue;
    }
    const tasks = await prisma.task.findMany({
      where: { projectId: p.id, parentTaskId: null },
      orderBy: [{ stableWorkSeq: 'asc' }, { taskOrder: 'asc' }, { createdAt: 'asc' }],
      select: { title: true, stableWorkSeq: true, taskOrder: true, createdAt: true },
    });
    console.log(`\n=== ${ref} (${tasks.length} subtasks) by stableWorkSeq ===`);
    tasks.forEach((t, i) =>
      console.log(`${i + 1}. seq=${t.stableWorkSeq} order=${t.taskOrder} ${t.title}`),
    );

    const byOrder = await prisma.task.findMany({
      where: { projectId: p.id, parentTaskId: null },
      orderBy: [{ taskOrder: 'asc' }, { createdAt: 'asc' }],
      select: { title: true, stableWorkSeq: true, taskOrder: true },
    });
    console.log(`\n=== ${ref} by taskOrder (API order) ===`);
    byOrder.slice(0, 8).forEach((t, i) =>
      console.log(`${i + 1}. seq=${t.stableWorkSeq} order=${t.taskOrder} ${t.title}`),
    );
    if (byOrder.length > 8) console.log(`... +${byOrder.length - 8} more`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
