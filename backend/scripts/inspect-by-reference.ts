import prisma from '../src/config/database';

async function inspectRef(ref: string) {
  const p = await prisma.project.findFirst({
    where: { referenceNumber: ref, deletedAt: null },
    select: { id: true, projectNumber: true, referenceNumber: true, name: true },
  });
  console.log(`\n=== ref ${ref} ===`, p);
  if (!p) return;
  const tasks = await prisma.task.findMany({
    where: { projectId: p.id, parentTaskId: null, deletedAt: null },
    select: {
      title: true,
      planDays: true,
      category: true,
      priority: true,
      assignedEmployeeId: true,
      assignedEmployee: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }],
    take: 8,
  });
  tasks.forEach((t, i) => {
    console.log(
      `  ${i}: ${t.title} | phase=${t.category} | days=${t.planDays} | pri=${t.priority} | ${t.assignedEmployee?.firstName || ''} ${t.assignedEmployee?.lastName || ''}`,
    );
  });
}

async function main() {
  for (const ref of ['2539', '2583', '2604']) {
    await inspectRef(ref);
  }
}

main().finally(() => prisma.$disconnect());
