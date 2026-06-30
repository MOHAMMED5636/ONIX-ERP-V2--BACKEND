import prisma from '../config/database';

export const DEFAULT_ATTENDANCE_PROGRAM_NAME = 'DUBAI 08:00 to 18:30';

type DaySchedule = { enabled: boolean; clockIn: string; clockOut: string };

export function defaultDubaiWeeklySchedule(): Record<string, DaySchedule> {
  const workDay = (enabled: boolean): DaySchedule => ({
    enabled,
    clockIn: '08:00',
    clockOut: '18:30',
  });
  return {
    mon: workDay(true),
    tue: workDay(true),
    wed: workDay(true),
    thu: workDay(true),
    fri: workDay(true),
    sat: workDay(false),
    sun: workDay(false),
  };
}

function formatHoursSummary(schedule: Record<string, DaySchedule>): string {
  const labels: Record<string, string> = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  };
  return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .map((key) => {
      const d = schedule[key];
      if (!d?.enabled) return `${labels[key]} off`;
      return `${labels[key]} ${d.clockIn}–${d.clockOut}`;
    })
    .join(' · ');
}

/** Create the standard Dubai office program when a company has none yet. */
export async function ensureDefaultAttendanceProgram(companyId: string): Promise<void> {
  const count = await prisma.attendanceProgram.count({ where: { companyId } });
  if (count > 0) return;

  const weeklySchedule = defaultDubaiWeeklySchedule();
  await prisma.attendanceProgram.create({
    data: {
      companyId,
      name: DEFAULT_ATTENDANCE_PROGRAM_NAME,
      description: 'Default UAE office hours (Monday–Friday 08:00–18:30)',
      weeklySchedule,
      hoursSummary: formatHoursSummary(weeklySchedule),
    },
  });
}
