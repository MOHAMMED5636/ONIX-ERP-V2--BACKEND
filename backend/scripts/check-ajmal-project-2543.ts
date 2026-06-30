import prisma from '../src/config/database';
import { taskRowInvolvesEmployee, taskRowAssignedToEmployee } from '../src/utils/employee-task-involvement';

async function main() {
  const project = await prisma.project.findFirst({
    where: {
      OR: [{ referenceNumber: '2543' }, { projectNumber: 2543 }],
    },
    select: { id: true, referenceNumber: true, name: true },
  });
  if (!project) {
    console.log('Project 2543 not found');
    return;
  }

  const ajmal = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { contains: 'ajmal', mode: 'insensitive' } },
        { firstName: { contains: 'ajmal', mode: 'insensitive' } },
        { lastName: { contains: 'moideen', mode: 'insensitive' } },
        { lastName: { contains: 'kutty', mode: 'insensitive' } },
        { firstName: { contains: 'moideen', mode: 'insensitive' } },
      ],
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });
  if (!ajmal) {
    console.log('Ajmal user not found');
    return;
  }

  const allAjmalUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'ajmal', mode: 'insensitive' } },
        { lastName: { contains: 'moideen', mode: 'insensitive' } },
      ],
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });
  console.log('All matching users:', allAjmalUsers);

  for (const user of allAjmalUsers) {
    console.log('\n=== User:', user.email, user.firstName, user.lastName, '===');
    const projectAssignment = await prisma.projectAssignment.findFirst({
      where: { projectId: project.id, employeeId: user.id },
    });
    console.log('Project assignment:', projectAssignment);

    const involved = await prisma.task.findMany({
      where: { projectId: project.id, ...taskRowInvolvesEmployee(user.id) },
      select: {
        id: true,
        title: true,
        assignedEmployeeId: true,
        createdBy: true,
        parentTaskId: true,
      },
      take: 20,
    });
    console.log('Tasks matching taskRowInvolvesEmployee:', involved.length);
    for (const t of involved) {
      console.log(' -', t.title, {
        assignedEmployeeId: t.assignedEmployeeId,
        createdBy: t.createdBy,
        assignedToUser: t.assignedEmployeeId === user.id,
        createdByUser: t.createdBy === user.id,
      });
    }

    const assigned = await prisma.task.findMany({
      where: { projectId: project.id, ...taskRowAssignedToEmployee(user.id) },
      select: { id: true, title: true, assignedEmployeeId: true, createdBy: true },
      take: 20,
    });
    console.log('Tasks matching taskRowAssignedToEmployee:', assigned.length);
    for (const t of assigned) {
      console.log(' -', t.title);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
