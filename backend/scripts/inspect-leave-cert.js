const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const leaves = await prisma.leave.findMany({
    where: {
      type: 'ANNUAL',
      status: 'APPROVED',
      OR: [
        { certificateFilename: null },
        { workflowStage: 'APPROVED' },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: {
      user: { select: { firstName: true, lastName: true } },
      workflowLogs: { orderBy: { createdAt: 'asc' }, take: 20 },
    },
  });

  console.log('Approved annual leaves missing certificate or stuck at APPROVED:');
  for (const l of leaves) {
    console.log('\n---');
    console.log({
      id: l.id,
      employee: `${l.user.firstName} ${l.user.lastName}`,
      workflowStage: l.workflowStage,
      status: l.status,
      certificateFilename: l.certificateFilename,
      hrFinalApprovedAt: l.hrFinalApprovedAt,
      approvedAt: l.approvedAt,
    });
    console.log(
      'logs:',
      l.workflowLogs.map((w) => `${w.action} -> ${w.newStage} @ ${w.createdAt.toISOString()}`),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
