import prisma from '../src/config/database';

async function main() {
  const projectId = '8d46bef8-97f8-4146-aced-28035ac57436';
  const ajmalId = '872b2ba6-3b83-4c9c-8110-c1def2341ef4';
  const soil = await prisma.task.findMany({
    where: {
      projectId,
      title: { contains: 'SOIL INVESTIGATION', mode: 'insensitive' },
    },
    select: {
      id: true,
      title: true,
      assignedEmployeeId: true,
      deletedAt: true,
      parentTaskId: true,
    },
  });
  console.log('SOIL INVESTIGATION tasks:', soil);

  const ajmalAny = await prisma.task.findMany({
    where: { projectId, assignedEmployeeId: ajmalId },
    select: { id: true, title: true, deletedAt: true, parentTaskId: true },
  });
  console.log('Any task assigned to Ajmal Moideen:', ajmalAny);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
