import prisma from '../src/config/database';
import { loadReferencePlanDaysData } from '../src/utils/default-plan-days';

async function main() {
  const project2539 = await prisma.project.findFirst({
    where: { projectNumber: 2539, deletedAt: null },
    select: { id: true, name: true, projectNumber: true },
  });
  const project2604 = await prisma.project.findFirst({
    where: { projectNumber: 2604, deletedAt: null },
    select: { id: true, name: true, projectNumber: true },
  });

  console.log('Project 2539:', project2539);
  console.log('Project 2604:', project2604);

  if (project2539) {
    const tasks = await prisma.task.findMany({
      where: { projectId: project2539.id, parentTaskId: null, deletedAt: null },
      select: {
        title: true,
        planDays: true,
        category: true,
        priority: true,
        assignedEmployeeId: true,
        assignedEmployee: { select: { id: true, firstName: true, lastName: true } },
        taskOrder: true,
        stableWorkSeq: true,
      },
      orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }],
      take: 15,
    });
    console.log('\n2539 tasks (first 15):');
    tasks.forEach((t, i) => {
      console.log(
        `${i}: ${t.title} | phase=${t.category} | days=${t.planDays} | pri=${t.priority} | assignee=${t.assignedEmployee?.firstName || ''} ${t.assignedEmployee?.lastName || ''} (${t.assignedEmployeeId || 'none'})`,
      );
    });
  }

  if (project2604) {
    const tasks = await prisma.task.findMany({
      where: { projectId: project2604.id, parentTaskId: null, deletedAt: null },
      select: {
        title: true,
        planDays: true,
        category: true,
        priority: true,
        assignedEmployeeId: true,
        assignedEmployee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }],
      take: 15,
    });
    console.log('\n2604 tasks (first 15):');
    tasks.forEach((t, i) => {
      console.log(
        `${i}: ${t.title} | phase=${t.category} | days=${t.planDays} | pri=${t.priority} | assignee=${t.assignedEmployee?.firstName || ''} ${t.assignedEmployee?.lastName || ''} (${t.assignedEmployeeId || 'none'})`,
      );
    });
  }

  const ref = await loadReferencePlanDaysData(prisma);
  const sampleNames = ['2D CONCEPT DESIGN', 'PD', 'AFFECTION PLAN', 'SOIL REPORT', 'ARCH - PD DRAWING'];
  console.log('\nReference template byName samples:');
  for (const name of sampleNames) {
    const key = name.toUpperCase();
    const row = ref.byName[key] ?? ref.byName[name];
    console.log(`  ${name}:`, row);
  }
  console.log('\nReference bySlot[0-6]:', ref.bySlot.slice(0, 7));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
