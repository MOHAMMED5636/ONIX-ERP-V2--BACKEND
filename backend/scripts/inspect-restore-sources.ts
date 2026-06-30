import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  const projectId = '76192747-f699-4e67-a258-06b3a12d787f';

  const allLogs = await prisma.projectActivityLog.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { action: true, createdAt: true, metadata: true },
  });
  console.log('Total logs:', allLogs.length);

  const created = allLogs.filter((l) => l.action.includes('SUBTASK') || l.action.includes('TASK'));
  console.log('\nTask-related actions:', [...new Set(created.map((l) => l.action))]);

  // Sample metadata from various actions
  for (const action of ['SUBTASK_CREATED', 'SUBTASK_UPDATED', 'SUBTASK_DELETED', 'PROJECT_UPDATED']) {
    const sample = allLogs.filter((l) => l.action === action).slice(-3);
    if (sample.length) {
      console.log(`\n--- ${action} samples ---`);
      sample.forEach((s) => console.log(JSON.stringify(s, null, 2)));
    }
  }

  // Search tasks by deleted titles globally
  const titles = [
    'SURVEY REPORT',
    'ARCH - SHOP DRAWING',
    'PD - NKL',
    'CONCEPT DESIGN - TRK',
  ];
  for (const title of titles) {
    const found = await prisma.task.findMany({
      where: { title: { equals: title, mode: 'insensitive' } },
      select: {
        id: true,
        title: true,
        project: { select: { referenceNumber: true, name: true } },
      },
    });
    if (found.length) console.log(`\nFound "${title}":`, found);
  }

  // Contract / project 2604
  const c2604 = await prisma.contract.findMany({
    where: { referenceNumber: { contains: '2604' } },
    select: { id: true, referenceNumber: true, projectId: true },
  });
  console.log('\nContracts 2604:', c2604);

  const p2604 = await prisma.project.findMany({
    where: {
      OR: [
        { referenceNumber: { contains: '2604' } },
        { name: { contains: '2604' } },
        { name: { contains: 'KADDOUR', mode: 'insensitive' } },
      ],
    },
    select: { id: true, referenceNumber: true, name: true },
  });
  console.log('Projects 2604/KADDOUR:', p2604);

  for (const p of p2604) {
    const subs = await prisma.task.findMany({
      where: { projectId: p.id, parentTaskId: null },
      select: { title: true, stableWorkSeq: true },
      orderBy: { stableWorkSeq: 'asc' },
    });
    console.log(`  ${p.referenceNumber}: ${subs.length} subtasks`, subs.map((s) => s.title));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
