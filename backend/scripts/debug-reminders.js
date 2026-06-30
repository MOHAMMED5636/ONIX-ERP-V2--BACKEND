const { PrismaClient } = require('@prisma/client');

const REMINDER_TZ = process.env.REMINDER_TZ || 'Asia/Dubai';

function getZonedParts(date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: REMINDER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  let hour = Number(pick('hour')) || 0;
  if (hour === 24) hour = 0;
  const minute = Number(pick('minute')) || 0;
  const y = pick('year');
  const m = pick('month');
  const d = pick('day');
  return { ymd: `${y}-${m}-${d}`, hour, minute };
}

async function main() {
  const p = new PrismaClient();
  const now = new Date();
  const parts = getZonedParts(now);
  console.log('TZ:', REMINDER_TZ);
  console.log('Now:', parts);

  const rows = await p.taskReminder.findMany({
    include: {
      task: {
        select: {
          title: true,
          status: true,
          workflowStatus: true,
          dueDate: true,
          projectId: true,
        },
      },
    },
  });
  console.log('Reminders count:', rows.length);
  for (const r of rows) {
    const match = parts.hour === r.hour && parts.minute === r.minute;
    console.log({
      id: r.id,
      task: r.task?.title,
      status: r.task?.status,
      workflowStatus: r.task?.workflowStatus,
      freq: r.frequency,
      trigger: r.triggerType,
      specificDate: r.specificDate,
      hour: r.hour,
      minute: r.minute,
      notifyUserIds: r.notifyUserIds,
      lastSentAt: r.lastSentAt,
      isActive: r.isActive,
      timeMatchesNow: match,
    });
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
