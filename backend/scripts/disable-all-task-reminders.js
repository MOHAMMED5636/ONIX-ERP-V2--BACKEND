/**
 * Turn off every task reminder: deactivate all TaskReminder rows and close pending alerts.
 * Usage: node scripts/disable-all-task-reminders.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const remindersDisabled = await prisma.taskReminder.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  const alertsClosed = await prisma.taskReminderAlert.updateMany({
    where: { status: { in: ['PENDING', 'SNOOZED'] } },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  console.log('Reminders deactivated:', remindersDisabled.count);
  console.log('Alerts closed:', alertsClosed.count);
  console.log('Set TASK_REMINDERS_ENABLED=false in .env to stop the scheduler from firing new ones.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
