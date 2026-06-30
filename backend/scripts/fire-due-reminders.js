/**
 * One-off: fire due reminders now (same logic as scheduler).
 * Usage: node scripts/fire-due-reminders.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const { processDueRemindersForUser, REMINDER_TZ } = require('../dist/services/taskReminderScheduler.service');
  const p = new PrismaClient();
  const reminders = await p.taskReminder.findMany({
    where: { isActive: true },
    select: { notifyUserIds: true },
  });
  const userIds = new Set();
  reminders.forEach((r) => (r.notifyUserIds || []).forEach((id) => userIds.add(id)));
  console.log('TZ:', REMINDER_TZ);
  let total = 0;
  for (const uid of userIds) {
    const n = await processDueRemindersForUser(uid);
    if (n) console.log('Sent', n, 'to user', uid);
    total += n;
  }
  console.log('Total sent:', total);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
