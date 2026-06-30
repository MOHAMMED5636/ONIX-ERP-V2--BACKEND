require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const pick = (t) => parts.find((x) => x.type === t)?.value || '';
  let hour = Number(pick('hour')) || 0;
  if (hour === 24) hour = 0;
  const minute = Number(pick('minute')) || 0;
  const nextMin = (minute + 1) % 60;
  const nextHour = minute === 59 ? (hour + 1) % 24 : hour;

  const updated = await p.taskReminder.updateMany({
    data: { hour: nextHour, minute: nextMin, lastSentAt: null },
  });
  console.log(`Set all active reminders to ${String(nextHour).padStart(2, '0')}:${String(nextMin).padStart(2, '0')} Dubai (in ~1 min)`);
  console.log('Updated rows:', updated.count);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
