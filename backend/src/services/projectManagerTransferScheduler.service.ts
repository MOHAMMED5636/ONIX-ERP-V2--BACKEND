import { processExpiredProjectManagerTransfers } from './projectManagerTransfer.service';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RUN_HOUR = Number(process.env.PM_TRANSFER_RUN_HOUR ?? 1);
const RUN_MINUTE = Number(process.env.PM_TRANSFER_RUN_MINUTE ?? 0);

let timer: ReturnType<typeof setInterval> | null = null;
let lastRunYmd: string | null = null;

function partsInTz(date: Date): { ymd: string; hour: number; minute: number } {
  const tz = process.env.REMINDER_TZ || 'Asia/Dubai';
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
  let hour = Number(pick('hour')) || 0;
  if (hour === 24) hour = 0;
  return {
    ymd: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hour,
    minute: Number(pick('minute')) || 0,
  };
}

async function tick(): Promise<void> {
  const now = new Date();
  const parts = partsInTz(now);
  if (parts.hour !== RUN_HOUR || parts.minute !== RUN_MINUTE) return;
  if (lastRunYmd === parts.ymd) return;

  try {
    const n = await processExpiredProjectManagerTransfers();
    lastRunYmd = parts.ymd;
    if (n > 0) {
      console.log(`[pm-transfer] Auto-returned ${n} transfer(s) (${parts.ymd})`);
    }
  } catch (err) {
    console.error('[pm-transfer] Scheduler error:', err);
  }
}

export function startProjectManagerTransferScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error('[pm-transfer] tick failed:', err));
  }, CHECK_INTERVAL_MS);
  tick().catch(() => {});
  console.log(`[pm-transfer] Scheduler started (daily ~${String(RUN_HOUR).padStart(2, '0')}:${String(RUN_MINUTE).padStart(2, '0')})`);
}

export function stopProjectManagerTransferScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
