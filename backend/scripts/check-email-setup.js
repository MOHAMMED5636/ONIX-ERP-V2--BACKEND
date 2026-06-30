const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const templates = await p.emailTemplate.findMany({
    select: { name: true, isActive: true },
    orderBy: { name: 'asc' },
  });
  const triggers = await p.emailTrigger.findMany({
    select: { eventKey: true, enabled: true, name: true, templateId: true },
  });
  const pmLogs = await p.emailLog.findMany({
    where: {
      OR: [
        { template: { contains: 'MANAGER', mode: 'insensitive' } },
        { subject: { contains: 'project manager', mode: 'insensitive' } },
      ],
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  const notices = await p.projectPmAssignmentNotice.findMany({
    take: 10,
    orderBy: { notifiedAt: 'desc' },
    include: {
      user: { select: { email: true, role: true, firstName: true, lastName: true } },
      project: { select: { referenceNumber: true, name: true } },
    },
  });
  console.log('TEMPLATES:', JSON.stringify(templates, null, 2));
  console.log('TRIGGERS:', JSON.stringify(triggers, null, 2));
  console.log('PM LOGS count sample:', pmLogs.length, pmLogs);
  console.log('PM NOTICES:', notices.length, JSON.stringify(notices, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
