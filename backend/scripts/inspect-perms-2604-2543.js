const { PrismaClient } = require('@prisma/client');
const {
  computeTaskPermissions,
} = require('../dist/utils/task-permissions');

const prisma = new PrismaClient();

async function main() {
  for (const ref of ['2604', '2543']) {
    const p = await prisma.project.findFirst({
      where: {
        OR: [
          { referenceNumber: { contains: ref } },
          { projectNumber: parseInt(ref, 10) },
        ],
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        projectNumber: true,
        status: true,
        createdBy: true,
      },
    });
    console.log('\n=== Project', ref, '===');
    console.log(p);
    if (!p) continue;

    const tasks = await prisma.task.findMany({
      where: { projectId: p.id, parentTaskId: null, deletedAt: null },
      take: 5,
      select: {
        id: true,
        title: true,
        createdBy: true,
        assignedEmployeeId: true,
        status: true,
        assignments: { select: { employeeId: true } },
      },
      orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }],
    });

    const pmUsers = await prisma.user.findMany({
      where: { role: { in: ['PROJECT_MANAGER', 'MANAGER'] }, isActive: true },
      take: 3,
      select: { id: true, firstName: true, lastName: true, role: true },
    });

    console.log('Sample PM users:', pmUsers.map((u) => `${u.firstName} ${u.lastName} (${u.role})`));
    for (const t of tasks) {
      console.log(`\nTask: ${t.title}`);
      console.log('  createdBy:', t.createdBy, 'assignee:', t.assignedEmployeeId);
      for (const pm of pmUsers) {
        const perms = computeTaskPermissions({
          user: { id: pm.id, role: pm.role },
          task: t,
          projectCreatedById: p.createdBy,
          projectStatus: p.status,
        });
        console.log(
          `  PM ${pm.firstName}: main=${perms.canEditMainFields} assignee=${perms.canEditAssigneeFields} suspended=${perms.isProjectSuspended} doneLocked=${perms.isDoneLocked}`,
        );
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
