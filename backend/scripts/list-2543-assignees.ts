import prisma from '../src/config/database';

async function main() {
  const project = await prisma.project.findFirst({
    where: { referenceNumber: '2543' },
    select: { id: true },
  });
  if (!project) {
    console.log('not found');
    return;
  }
  const ajmalId = '872b2ba6-3b83-4c9c-8110-c1def2341ef4';
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      assignedEmployeeId: true,
      parentTaskId: true,
      taskOrder: true,
    },
    orderBy: [{ taskOrder: 'asc' }, { createdAt: 'asc' }],
  });
  console.log('All tasks in 2543:', tasks.length);
  for (const t of tasks) {
    const u = t.assignedEmployeeId
      ? await prisma.user.findUnique({
          where: { id: t.assignedEmployeeId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;
    const name = u ? `${u.firstName} ${u.lastName}` : 'none';
    const flag = t.assignedEmployeeId === ajmalId ? ' << AJMAL' : '';
    console.log(
      `- [${t.taskOrder}] ${String(t.title).slice(0, 50)} | parent: ${t.parentTaskId ? 'yes' : 'root'} | ${name}${flag}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
