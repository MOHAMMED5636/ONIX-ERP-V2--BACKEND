import Holidays from 'date-holidays';

/** Dubai / UAE federal public holidays (Asia/Dubai). */
export const UAE_HOLIDAY_TIMEZONE = 'Asia/Dubai';

export type UaePublicHoliday = {
  date: string;
  name: string;
};

let holidaysClient: Holidays | null = null;

function getHolidaysClient(): Holidays {
  if (!holidaysClient) {
    holidaysClient = new Holidays('AE');
    holidaysClient.setTimezone(UAE_HOLIDAY_TIMEZONE);
    holidaysClient.setLanguages('en');
  }
  return holidaysClient;
}

function ymdInDubai(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: UAE_HOLIDAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function enumerateHolidayDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  let cursor = new Date(start);
  const endMs = end.getTime();

  while (cursor.getTime() < endMs) {
    const ymd = ymdInDubai(cursor);
    if (!seen.has(ymd)) {
      seen.add(ymd);
      dates.push(ymd);
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
}

/** Fixed UAE holidays sometimes missing from the library dataset. */
function supplementalUaeHolidays(year: number): UaePublicHoliday[] {
  const mm = String(year);
  return [
    { date: `${mm}-12-01`, name: 'Commemoration Day' },
    { date: `${mm}-12-03`, name: 'National Day (observed)' },
  ];
}

function mergeHoliday(
  map: Map<string, string>,
  date: string,
  name: string,
): void {
  const existing = map.get(date);
  if (!existing) {
    map.set(date, name);
    return;
  }
  if (existing.toLowerCase().includes(name.toLowerCase())) return;
  if (name.toLowerCase().includes(existing.toLowerCase())) {
    map.set(date, name);
    return;
  }
  map.set(date, `${existing} / ${name}`);
}

export function getUaePublicHolidaysForYear(year: number): UaePublicHoliday[] {
  const map = new Map<string, string>();
  const hd = getHolidaysClient();

  for (const h of hd.getHolidays(year)) {
    if (h.type !== 'public') continue;
    const name = String(h.name || '').trim() || 'Public holiday';
    for (const date of enumerateHolidayDates(new Date(h.start), new Date(h.end))) {
      mergeHoliday(map, date, name);
    }
  }

  for (const extra of supplementalUaeHolidays(year)) {
    mergeHoliday(map, extra.date, extra.name);
  }

  return [...map.entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getUaePublicHolidaysInRange(
  startYmd: string,
  endYmd: string,
): UaePublicHoliday[] {
  const startYear = parseInt(startYmd.slice(0, 4), 10);
  const endYear = parseInt(endYmd.slice(0, 4), 10);
  const all: UaePublicHoliday[] = [];

  for (let y = startYear; y <= endYear; y += 1) {
    all.push(...getUaePublicHolidaysForYear(y));
  }

  return all.filter((h) => h.date >= startYmd && h.date <= endYmd);
}

export function buildUaePublicHolidayMap(
  startYmd: string,
  endYmd: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of getUaePublicHolidaysInRange(startYmd, endYmd)) {
    mergeHoliday(map, h.date, h.name);
  }
  return map;
}

export function getUaePublicHolidayName(
  dateYmd: string,
  startYmd?: string,
  endYmd?: string,
): string | null {
  const year = parseInt(dateYmd.slice(0, 4), 10);
  const rangeStart = startYmd ?? `${year}-01-01`;
  const rangeEnd = endYmd ?? `${year}-12-31`;
  return buildUaePublicHolidayMap(rangeStart, rangeEnd).get(dateYmd) ?? null;
}
