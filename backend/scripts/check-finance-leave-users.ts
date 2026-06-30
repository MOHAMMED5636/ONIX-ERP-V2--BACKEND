import prisma from '../src/config/database';
import { getFinanceClearanceUserIds } from '../src/services/leaveAnnualWorkflow.service';

async function main() {
  const taanUsers = await prisma.user.findMany({
    where: {
      OR: [
        { lastName: { contains: 'Taan', mode: 'insensitive' } },
        { firstName: { contains: 'Mohammed', mode: 'insensitive' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, role: true, department: true, email: true },
  });
  console.log('Taan/Mohammed users:', JSON.stringify(taanUsers, null, 2));

  const financeIds = await getFinanceClearanceUserIds();
  console.log('Finance clearance user IDs:', financeIds);

  const pending = await prisma.leave.findMany({
    where: { workflowStage: 'PENDING_FINANCE_CLEARANCE' },
    select: { id: true, userId: true, workflowStage: true, reason: true, startDate: true },
  });
  console.log('Pending finance clearance:', JSON.stringify(pending, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
