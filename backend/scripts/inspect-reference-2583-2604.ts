import prisma from '../src/config/database';
import { loadReferencePlanDaysData } from '../src/utils/default-plan-days';

async function main() {
  for (const num of [2583, 2604, 2539]) {
    const p = await prisma.project.findFirst({
      where: { projectNumber: num, deletedAt: null },
      select: { id: true, name: true, projectNumber: true },
    });
    console.log(`Project ${num}:`, p);
    if (!p) continue;
    const tasks = await prisma.task.findMany({
      where: { projectId: p.id, parentTaskId: null, deletedAt: null },
      select: {
        title: true,
        planDays: true,
        category: true,
        priority: true,
        assignedEmployeeId: true,
        assignedEmployee: { select: { firstName: true, lastName: true } },
        taskOrder: true,
        stableWorkSeq: true,
      },
      orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }],
      take: 10,
    });
    console.log(`  First ${tasks.length} tasks:`);
    tasks.forEach((t, i) => {
      console.log(
        `    ${i}: ${t.title} | phase=${t.category} | days=${t.planDays} | pri=${t.priority} | ${t.assignedEmployee?.firstName || ''} ${t.assignedEmployee?.lastName || ''}`,
      );
    });
  }

  const ref2583 = await loadReferencePlanDaysData(prisma, 2583);
  console.log('\nReference template from 2583 bySlot[0-6]:', ref2583.bySlot.slice(0, 7));
  console.log('AFFECTION PLAN:', ref2583.byName['AFFECTION PLAN']);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
