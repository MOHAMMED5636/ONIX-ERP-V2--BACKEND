require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const projs = await p.project.findMany({
    where: { projectNumber: { in: [2539, 2604] } },
    select: {
      projectNumber: true,
      name: true,
      tasks: {
        where: { parentTaskId: null, deletedAt: null },
        select: { title: true, planDays: true, taskOrder: true, stableWorkSeq: true },
        orderBy: [{ taskOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { projectNumber: 'asc' },
  });

  for (const proj of projs) {
    console.log(`\n=== ${proj.projectNumber} ${proj.name} ===`);
    proj.tasks.forEach((t, i) => {
      console.log(`${i + 1}. planDays=${t.planDays ?? 'null'}\t"${t.title}"`);
    });
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
