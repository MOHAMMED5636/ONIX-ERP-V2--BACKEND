import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  const nums = [2583, 2604];
  for (const n of nums) {
    const byProjectNumber = await prisma.project.findMany({
      where: { projectNumber: n },
      select: { id: true, projectNumber: true, referenceNumber: true, name: true },
    });
    const byRef = await prisma.project.findMany({
      where: { referenceNumber: String(n) },
      select: { id: true, projectNumber: true, referenceNumber: true, name: true },
    });
    const nameMatch = await prisma.project.findMany({
      where: { name: { contains: 'FARHAD', mode: 'insensitive' } },
      select: { id: true, projectNumber: true, referenceNumber: true, name: true },
    });
    console.log(`\n=== ${n} ===`);
    console.log('by projectNumber:', byProjectNumber);
    console.log('by referenceNumber:', byRef);
    if (n === 2583) console.log('FARHAD name match:', nameMatch);
  }

  const p2583 = await prisma.project.findFirst({
    where: {
      OR: [
        { projectNumber: 2583 },
        { referenceNumber: '2583' },
        { name: { contains: 'FARHAD', mode: 'insensitive' } },
      ],
    },
  });
  if (p2583) {
    const tasks = await prisma.task.count({ where: { projectId: p2583.id, parentTaskId: null } });
    console.log(`\nProject 2583 id=${p2583.id} subtasks=${tasks}`);
  }

  // Recent projects with subtasks containing (Copy)
  const copyTasks = await prisma.task.findMany({
    where: { title: { contains: '(Copy)', mode: 'insensitive' }, parentTaskId: null },
    take: 20,
    select: {
      id: true,
      title: true,
      projectId: true,
      stableWorkSeq: true,
      project: { select: { projectNumber: true, referenceNumber: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  console.log('\nRecent (Copy) subtasks:', JSON.stringify(copyTasks, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
