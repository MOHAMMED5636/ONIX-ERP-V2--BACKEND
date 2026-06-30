import { processInventoryThresholds } from './threshold.service';

export const EAM_TZ = process.env.REMINDER_TZ || 'Asia/Dubai';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RUN_HOUR = Number(process.env.EAM_THRESHOLD_RUN_HOUR ?? 7);
const RUN_MINUTE = Number(process.env.EAM_THRESHOLD_RUN_MINUTE ?? 0);

let timer: ReturnType<typeof setInterval> | null = null;
let lastRunYmd: string | null = null;

function partsInTz(date: Date): { ymd: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: EAM_TZ,
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
    const n = await processInventoryThresholds();
    lastRunYmd = parts.ymd;
    if (n > 0) console.log(`[eam-threshold] Created ${n} draft requisition(s) (${parts.ymd})`);
  } catch (err) {
    console.error('[eam-threshold] Scheduler error:', err);
  }
}

export function startEamThresholdScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error('[eam-threshold] tick failed:', err));
  }, CHECK_INTERVAL_MS);
  tick().catch(() => {});
  console.log(`[eam-threshold] Scheduler started (${EAM_TZ}, daily ~${String(RUN_HOUR).padStart(2, '0')}:${String(RUN_MINUTE).padStart(2, '0')})`);
}

export function stopEamThresholdScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
