import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  const projectId = '76192747-f699-4e67-a258-06b3a12d787f';

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: { select: { name: true } } },
  });
  console.log('Project:', project);

  const logs = await prisma.projectActivityLog.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, createdAt: true, metadata: true },
  });
  console.log('\nActivity logs:', logs.length);
  for (const l of logs.slice(0, 20)) {
    console.log(JSON.stringify({ action: l.action, at: l.createdAt, meta: l.metadata }));
  }

  // All tasks ever linked (including children) - maybe orphaned?
  const allTasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, title: true, parentTaskId: true, stableWorkSeq: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  console.log('\nAll tasks on project:', allTasks.length, allTasks);

  // Search FARHAD projects
  const farhad = await prisma.project.findMany({
    where: {
      OR: [
        { name: { contains: 'FARHAD', mode: 'insensitive' } },
        { name: { contains: 'MOMENZADEH', mode: 'insensitive' } },
        { referenceNumber: { contains: '2604' } },
      ],
    },
    select: { id: true, referenceNumber: true, projectNumber: true, name: true },
  });
  console.log('\nFARHAD/2604 projects:', farhad);

  for (const p of farhad) {
    const n = await prisma.task.count({ where: { projectId: p.id, parentTaskId: null } });
    console.log(`  ${p.referenceNumber} ${p.name}: ${n} subtasks`);
  }

  // Projects with most subtasks recently updated
  const recentSubtasks = await prisma.task.findMany({
    where: { parentTaskId: null },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: {
      title: true,
      stableWorkSeq: true,
      updatedAt: true,
      project: { select: { referenceNumber: true, name: true } },
    },
  });
  console.log('\nRecent top-level tasks:', JSON.stringify(recentSubtasks, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
