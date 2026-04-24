import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Weekday = (typeof WEEKDAY_ORDER)[number];

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

type DaySchedule = { enabled: boolean; clockIn: string; clockOut: string };
type WeeklySchedule = Record<Weekday, DaySchedule>;

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function normalizeWeeklySchedule(raw: unknown): WeeklySchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const base = {} as WeeklySchedule;
  for (const k of WEEKDAY_ORDER) {
    const v = o[k];
    if (v && typeof v === 'object') {
      const d = v as Record<string, unknown>;
      base[k] = {
        enabled: Boolean(d.enabled),
        clockIn: String(d.clockIn ?? '09:00').slice(0, 5),
        clockOut: String(d.clockOut ?? '17:00').slice(0, 5),
      };
    } else {
      base[k] = { enabled: false, clockIn: '09:00', clockOut: '17:00' };
    }
  }
  return base;
}

function validateWeeklySchedule(s: WeeklySchedule | null): string | null {
  if (!s) return 'Invalid weekly schedule.';
  let workDays = 0;
  for (const k of WEEKDAY_ORDER) {
    const d = s[k];
    if (d.enabled) {
      workDays += 1;
      if (!String(d.clockIn || '').trim() || !String(d.clockOut || '').trim()) {
        return `Set clock-in and clock-out for ${WEEKDAY_LABELS[k]}, or turn that day OFF.`;
      }
    }
  }
  if (workDays === 0) return 'At least one day must be ON with clock-in and clock-out times.';
  return null;
}

function formatHoursSummary(s: WeeklySchedule): string {
  return WEEKDAY_ORDER.map((key) => {
    const d = s[key];
    const short = WEEKDAY_LABELS[key].slice(0, 3);
    if (!d.enabled) return `${short} off`;
    return `${short} ${d.clockIn}–${d.clockOut}`;
  }).join(' · ');
}

function rowToClient(row: {
  id: string;
  name: string;
  description: string | null;
  weeklySchedule: unknown;
  hoursSummary: string | null;
}) {
  const sched = normalizeWeeklySchedule(row.weeklySchedule);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    weeklySchedule: sched,
    hours: row.hoursSummary || (sched ? formatHoursSummary(sched) : ''),
  };
}

async function resolveCompanyFromRequest(
  req: AuthRequest,
  source: 'query' | 'body' | 'both' = 'both'
): Promise<{ id: string; name: string } | null> {
  const q = req.query || {};
  const b = (req.body || {}) as Record<string, unknown>;
  let companyId = '';
  let companyName = '';
  if (source === 'query' || source === 'both') {
    if (typeof q.companyId === 'string' && q.companyId.trim()) companyId = q.companyId.trim();
    if (typeof q.companyName === 'string' && q.companyName.trim()) companyName = q.companyName.trim();
  }
  if (source === 'body' || source === 'both') {
    if (!companyId && typeof b.companyId === 'string' && b.companyId.trim()) companyId = b.companyId.trim();
    if (!companyName && typeof b.companyName === 'string' && b.companyName.trim()) companyName = b.companyName.trim();
  }
  if (companyId) {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    return c ? { id: c.id, name: c.name } : null;
  }
  if (companyName) {
    const c = await prisma.company.findFirst({
      where: { name: { equals: companyName, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    return c ? { id: c.id, name: c.name } : null;
  }
  return null;
}

async function findNameDuplicate(companyId: string, name: string, excludeId?: string) {
  const nameTrim = name.trim();
  const existing = await prisma.attendanceProgram.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const lower = nameTrim.toLowerCase();
  return existing.find((e) => e.name.toLowerCase() === lower && (!excludeId || e.id !== excludeId));
}

/**
 * GET /api/employees/attendance-programs?companyId=|companyName=
 */
export const listAttendancePrograms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await resolveCompanyFromRequest(req, 'query');
    if (!company) {
      res.status(400).json({
        success: false,
        message: 'companyId or companyName is required.',
      });
      return;
    }
    const rows = await prisma.attendanceProgram.findMany({
      where: { companyId: company.id },
      orderBy: { name: 'asc' },
    });
    res.json({
      success: true,
      data: rows.map(rowToClient),
    });
  } catch (error) {
    console.error('listAttendancePrograms error:', error);
    res.status(500).json({ success: false, message: 'Failed to load attendance programs.' });
  }
};

/**
 * POST /api/employees/attendance-programs
 * Body: companyId|companyName, name, description?, weeklySchedule
 */
export const createAttendanceProgram = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const company = await resolveCompanyFromRequest(req, 'both');
    if (!company) {
      res.status(400).json({
        success: false,
        message: 'companyId or companyName is required.',
      });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      res.status(400).json({ success: false, message: 'Program name is required.' });
      return;
    }
    const schedule = normalizeWeeklySchedule(body.weeklySchedule);
    const err = validateWeeklySchedule(schedule);
    if (err) {
      res.status(400).json({ success: false, message: err });
      return;
    }
    const dup = await findNameDuplicate(company.id, name);
    if (dup) {
      res.status(409).json({
        success: false,
        message: `A program named "${name}" already exists for this company.`,
      });
      return;
    }
    const description =
      body.description === null || body.description === undefined
        ? null
        : String(body.description).trim() || null;
    const hoursSummary = formatHoursSummary(schedule!);
    const row = await prisma.attendanceProgram.create({
      data: {
        companyId: company.id,
        name,
        description,
        weeklySchedule: schedule as object,
        hoursSummary,
      },
    });
    res.status(201).json({
      success: true,
      message: `Program "${name}" saved.`,
      data: rowToClient(row),
    });
  } catch (error) {
    console.error('createAttendanceProgram error:', error);
    res.status(500).json({ success: false, message: 'Failed to create attendance program.' });
  }
};

/**
 * PUT /api/employees/attendance-programs/:programId
 * Body: name?, description?, weeklySchedule?, companyId|companyName (scope check)
 */
export const updateAttendanceProgram = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { programId } = req.params;
    if (!programId || !isUuid(programId)) {
      res.status(400).json({ success: false, message: 'Invalid program id.' });
      return;
    }
    const company = await resolveCompanyFromRequest(req, 'both');
    if (!company) {
      res.status(400).json({
        success: false,
        message: 'companyId or companyName is required.',
      });
      return;
    }
    const existing = await prisma.attendanceProgram.findFirst({
      where: { id: programId, companyId: company.id },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Attendance program not found for this company.' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const newName =
      typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name;
    let schedule = normalizeWeeklySchedule(body.weeklySchedule);
    if (body.weeklySchedule !== undefined && body.weeklySchedule !== null) {
      const err = validateWeeklySchedule(schedule);
      if (err) {
        res.status(400).json({ success: false, message: err });
        return;
      }
    } else {
      schedule = normalizeWeeklySchedule(existing.weeklySchedule);
    }
    if (!schedule) {
      res.status(400).json({ success: false, message: 'Invalid weekly schedule.' });
      return;
    }
    const dup = await findNameDuplicate(company.id, newName, existing.id);
    if (dup) {
      res.status(409).json({
        success: false,
        message: `Another program already uses the name "${newName}".`,
      });
      return;
    }
    const description =
      body.description === undefined
        ? existing.description
        : body.description === null
          ? null
          : String(body.description).trim() || null;

    const oldName = existing.name;
    const role = req.user?.role;
    const canSyncEmployees = role === 'ADMIN' || role === 'HR';
    let employeesUpdated = 0;

    if (oldName !== newName && canSyncEmployees) {
      const result = await prisma.user.updateMany({
        where: {
          company: { equals: company.name, mode: 'insensitive' },
          attendanceProgram: oldName,
        },
        data: { attendanceProgram: newName },
      });
      employeesUpdated = result.count;
    }

    const hoursSummary = formatHoursSummary(schedule);
    const row = await prisma.attendanceProgram.update({
      where: { id: existing.id },
      data: {
        name: newName,
        description,
        weeklySchedule: schedule as object,
        hoursSummary,
      },
    });

    let message = 'Program updated.';
    if (oldName !== newName) {
      message =
        canSyncEmployees && employeesUpdated > 0
          ? `Saved. ${employeesUpdated} employee(s) now use "${newName}".`
          : canSyncEmployees
            ? `Saved. No employees had the old program "${oldName}" assigned.`
            : 'Program updated in the catalog only. Sign in as HR/Admin to sync renames to employee records.';
    }

    res.json({
      success: true,
      message,
      data: { ...rowToClient(row), employeesRenamed: employeesUpdated },
    });
  } catch (error) {
    console.error('updateAttendanceProgram error:', error);
    res.status(500).json({ success: false, message: 'Failed to update attendance program.' });
  }
};

/**
 * DELETE /api/employees/attendance-programs/:programId?companyId=|companyName=
 */
export const deleteAttendanceProgram = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { programId } = req.params;
    if (!programId || !isUuid(programId)) {
      res.status(400).json({ success: false, message: 'Invalid program id.' });
      return;
    }
    const company = await resolveCompanyFromRequest(req, 'query');
    if (!company) {
      res.status(400).json({
        success: false,
        message: 'companyId or companyName is required.',
      });
      return;
    }
    const existing = await prisma.attendanceProgram.findFirst({
      where: { id: programId, companyId: company.id },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Attendance program not found for this company.' });
      return;
    }
    const inUse = await prisma.user.count({
      where: {
        company: { equals: company.name, mode: 'insensitive' },
        attendanceProgram: existing.name,
      },
    });
    if (inUse > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete: ${inUse} employee(s) still use this program. Reassign them first.`,
      });
      return;
    }
    await prisma.attendanceProgram.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Attendance program deleted.' });
  } catch (error) {
    console.error('deleteAttendanceProgram error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attendance program.' });
  }
};
