/**
 * Dry-run PM assignment email for the first contract with an assigned manager + project.
 * Usage: node scripts/test-pm-assignment-email.js
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  const contract = await p.contract.findFirst({
    where: {
      assignedManagerId: { not: null },
      projectId: { not: null },
    },
    select: {
      assignedManagerId: true,
      projectId: true,
      referenceNumber: true,
      assignedManager: { select: { email: true, firstName: true, lastName: true, role: true } },
      project: { select: { id: true, name: true, referenceNumber: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!contract?.assignedManagerId || !contract.projectId) {
    console.log('No contract with assigned manager + linked project found.');
    await p.$disconnect();
    return;
  }

  console.log('Testing PM email for:', {
    contract: contract.referenceNumber,
    manager: contract.assignedManager?.email,
    project: contract.project?.referenceNumber,
  });

  const { notifyPmProjectAssignment } = require('../dist/services/projectPmAssignmentNotice.service');
  await notifyPmProjectAssignment(
    contract.assignedManagerId,
    contract.projectId,
    'ASSIGNMENT',
    null,
  );

  const logs = await p.emailLog.findMany({
    where: { template: 'PROJECT MANAGER ASSIGNMENT' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  console.log('Latest PM assignment logs:', logs);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
