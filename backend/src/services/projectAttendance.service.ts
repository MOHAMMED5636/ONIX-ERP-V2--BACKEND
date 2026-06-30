import {
  AttendanceCategory,
  ProjectAttendanceLog,
  User,
  UserRole,
} from '@prisma/client';
import prisma from '../config/database';
import {
  assertWithinProjectGeofence,
  findActiveProjectWithinGeofence,
  resolveProjectSiteCoords,
  validateGpsInput,
  ACTIVE_PROJECT_STATUSES,
} from './projectGeofence.service';
import { saveAttendanceFacePhoto } from './faceAttendance.service';

const SUPERVISOR_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.HR,
  UserRole.MANAGER,
  UserRole.PROJECT_MANAGER,
];

/** Default shift end (UTC) when auto-closing a forgotten punch-out */
const DEFAULT_SHIFT_END_UTC_HOUR = 18;

export class ProjectAttendanceError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isSupervisorRole(role: UserRole): boolean {
  return SUPERVISOR_ROLES.includes(role);
}

function calendarDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultShiftEndForDate(punchIn: Date): Date {
  const end = new Date(punchIn);
  end.setUTCHours(DEFAULT_SHIFT_END_UTC_HOUR, 0, 0, 0);
  return end;
}

async function resolveHourlyRate(employeeId: string): Promise<number> {
  const labour = await prisma.labourDetails.findUnique({
    where: { userId: employeeId },
    select: { hourlyRate: true, basicSalary: true },
  });

  if (labour?.hourlyRate != null && Number(labour.hourlyRate) > 0) {
    return Number(labour.hourlyRate);
  }

  // Fallback: basic salary / (26 working days × 8 hours)
  if (labour?.basicSalary != null && Number(labour.basicSalary) > 0) {
    return Number(labour.basicSalary) / (26 * 8);
  }

  return 0;
}

function calculateLaborCost(punchIn: Date, punchOut: Date, hourlyRate: number): {
  workedHours: number;
  costAmount: number;
} {
  const ms = punchOut.getTime() - punchIn.getTime();
  const workedHours = Math.max(0, ms / (1000 * 60 * 60));
  const costAmount = Math.round(workedHours * hourlyRate * 100) / 100;
  return { workedHours, costAmount };
}

async function closeOpenLog(
  log: ProjectAttendanceLog,
  punchOut: Date,
  options: {
    autoClosed?: boolean;
    punchOutLatitude?: number;
    punchOutLongitude?: number;
    employeeCategory: AttendanceCategory;
  },
): Promise<ProjectAttendanceLog> {
  let costAmount = 0;
  let workedHours: number | null = null;

  if (options.employeeCategory === AttendanceCategory.LABOR) {
    const hourlyRate = await resolveHourlyRate(log.employeeId);
    const calc = calculateLaborCost(log.punchIn, punchOut, hourlyRate);
    workedHours = calc.workedHours;
    costAmount = calc.costAmount;
  }

  return prisma.projectAttendanceLog.update({
    where: { id: log.id },
    data: {
      punchOut,
      workedHours,
      costAmount,
      autoClosed: options.autoClosed ?? false,
      punchOutLatitude: options.punchOutLatitude,
      punchOutLongitude: options.punchOutLongitude,
    },
    include: logInclude,
  });
}

const logInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, attendanceCategory: true } },
  supervisor: { select: { id: true, firstName: true, lastName: true } },
  project: { select: { id: true, name: true, referenceNumber: true, projectNumber: true } },
};

async function getOpenLog(employeeId: string): Promise<ProjectAttendanceLog | null> {
  return prisma.projectAttendanceLog.findFirst({
    where: { employeeId, punchOut: null },
    orderBy: { punchIn: 'desc' },
  });
}

/** Auto-close stale open shift before opening a new one (spec §6). */
async function autoCloseStaleOpenLog(
  employee: Pick<User, 'id' | 'attendanceCategory'>,
): Promise<ProjectAttendanceLog | null> {
  const open = await getOpenLog(employee.id);
  if (!open) return null;

  const now = new Date();
  if (calendarDayKey(open.punchIn) === calendarDayKey(now)) {
    throw new ProjectAttendanceError(
      'Employee already has an open site shift. Punch out first.',
      409,
      'OPEN_SHIFT_EXISTS',
      { logId: open.id, projectId: open.projectId },
    );
  }

  const punchOut = defaultShiftEndForDate(open.punchIn);
  return closeOpenLog(open, punchOut, {
    autoClosed: true,
    employeeCategory: employee.attendanceCategory,
  });
}

function validateLaborFace(
  employeeId: string,
  employee: Pick<User, 'photo' | 'faceDescriptor'>,
  faceImage?: string,
  faceMatchScore?: number,
): { facePhotoPath: string | null; faceMatchScore: number | null; faceVerified: boolean } {
  const minScore = 0.9;

  if (!employee.photo && !employee.faceDescriptor) {
    throw new ProjectAttendanceError(
      'Labor worker must be face-enrolled before site punch-in. Upload profile photo or enroll face first.',
      400,
      'FACE_ENROLLMENT_REQUIRED',
    );
  }

  if (!faceImage || typeof faceImage !== 'string') {
    throw new ProjectAttendanceError(
      'Live face photo is mandatory for labor punch-in.',
      400,
      'FACE_IMAGE_REQUIRED',
    );
  }

  const score = typeof faceMatchScore === 'number' ? faceMatchScore : Number(faceMatchScore);
  if (!Number.isFinite(score)) {
    throw new ProjectAttendanceError(
      'Face verification score is required for labor punch-in.',
      400,
      'FACE_MATCH_REQUIRED',
    );
  }

  if (score < minScore) {
    throw new ProjectAttendanceError(
      `Face match below required threshold (${(minScore * 100).toFixed(0)}%).`,
      403,
      'FACE_MATCH_FAILED',
      { score, minScore },
    );
  }

  let facePhotoPath: string | null = null;
  try {
    facePhotoPath = saveAttendanceFacePhoto(employeeId, 'CHECK_IN', faceImage);
  } catch {
    throw new ProjectAttendanceError('Invalid face image.', 400, 'FACE_IMAGE_INVALID');
  }

  return { facePhotoPath, faceMatchScore: score, faceVerified: true };
}

export interface SitePunchInInput {
  actorId: string;
  employeeId?: string;
  projectId?: string;
  latitude: unknown;
  longitude: unknown;
  faceImage?: string;
  faceMatchScore?: number;
}

export async function sitePunchIn(input: SitePunchInInput) {
  const gps = validateGpsInput(input.latitude, input.longitude);
  if (!gps.ok) throw new ProjectAttendanceError(gps.message, 400, 'INVALID_GPS');

  const actor = await prisma.user.findUnique({ where: { id: input.actorId } });
  if (!actor || !actor.isActive) {
    throw new ProjectAttendanceError('Unauthorized', 401);
  }

  const targetEmployeeId = input.employeeId?.trim() || input.actorId;
  const isProxyPunch = targetEmployeeId !== input.actorId;

  const employee = await prisma.user.findUnique({ where: { id: targetEmployeeId } });
  if (!employee || !employee.isActive) {
    throw new ProjectAttendanceError('Employee not found', 404);
  }

  if (employee.attendanceCategory === AttendanceCategory.LABOR && !isProxyPunch) {
    throw new ProjectAttendanceError(
      'Labor workers cannot self punch. A supervisor must punch on their behalf.',
      403,
      'LABOR_SELF_PUNCH_FORBIDDEN',
    );
  }

  if (isProxyPunch) {
    if (!isSupervisorRole(actor.role)) {
      throw new ProjectAttendanceError(
        'Only supervisors can punch attendance for other employees.',
        403,
        'SUPERVISOR_REQUIRED',
      );
    }
    if (employee.attendanceCategory !== AttendanceCategory.LABOR) {
      throw new ProjectAttendanceError(
        'Supervisors can only proxy-punch for employees with LABOR attendance category.',
        400,
        'NOT_LABOR_EMPLOYEE',
      );
    }
  }

  await autoCloseStaleOpenLog(employee);

  let resolvedProjectId = input.projectId?.trim();
  let siteCoords;
  let distance = 0;

  if (resolvedProjectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: resolvedProjectId,
        deletedAt: null,
        status: { in: ACTIVE_PROJECT_STATUSES },
      },
    });
    if (!project) {
      throw new ProjectAttendanceError('Active project not found', 404, 'PROJECT_NOT_FOUND');
    }
    siteCoords = await resolveProjectSiteCoords(resolvedProjectId);
    if (!siteCoords) {
      throw new ProjectAttendanceError(
        'Project has no site coordinates. Set site latitude/longitude on the project or linked contract.',
        400,
        'PROJECT_COORDS_MISSING',
      );
    }
    const geo = assertWithinProjectGeofence(gps.latitude, gps.longitude, siteCoords);
    if (!geo.ok) {
      throw new ProjectAttendanceError(geo.message, 403, 'OUTSIDE_GEOFENCE', {
        distance: geo.distance,
        allowedRadius: siteCoords.radiusMeters,
      });
    }
    distance = geo.distance;
  } else if (
    employee.attendanceCategory === AttendanceCategory.SITE ||
    isSupervisorRole(actor.role)
  ) {
    const match = await findActiveProjectWithinGeofence(gps.latitude, gps.longitude);
    if (!match) {
      throw new ProjectAttendanceError(
        'No active project found within geofence range. Move closer to a project site or specify projectId.',
        403,
        'NO_PROJECT_IN_RANGE',
      );
    }
    resolvedProjectId = match.projectId;
    siteCoords = match;
    distance = match.distance;
  } else {
    throw new ProjectAttendanceError('projectId is required', 400, 'PROJECT_ID_REQUIRED');
  }

  let faceFields = { facePhotoPath: null as string | null, faceMatchScore: null as number | null, faceVerified: false };
  if (employee.attendanceCategory === AttendanceCategory.LABOR) {
    faceFields = validateLaborFace(employee.id, employee, input.faceImage, input.faceMatchScore);
  }

  const log = await prisma.projectAttendanceLog.create({
    data: {
      employeeId: employee.id,
      projectId: resolvedProjectId!,
      supervisorId: isProxyPunch ? actor.id : null,
      punchIn: new Date(),
      latitude: gps.latitude,
      longitude: gps.longitude,
      distanceFromSiteM: distance,
      isWithinGeofence: true,
      facePhotoPath: faceFields.facePhotoPath,
      faceMatchScore: faceFields.faceMatchScore,
      faceVerified: faceFields.faceVerified,
    },
    include: logInclude,
  });

  return { log, site: siteCoords };
}

export interface SitePunchOutInput {
  actorId: string;
  employeeId?: string;
  projectId?: string;
  latitude?: unknown;
  longitude?: unknown;
}

export async function sitePunchOut(input: SitePunchOutInput) {
  const actor = await prisma.user.findUnique({ where: { id: input.actorId } });
  if (!actor || !actor.isActive) {
    throw new ProjectAttendanceError('Unauthorized', 401);
  }

  const targetEmployeeId = input.employeeId?.trim() || input.actorId;
  const isProxyPunch = targetEmployeeId !== input.actorId;

  const employee = await prisma.user.findUnique({ where: { id: targetEmployeeId } });
  if (!employee || !employee.isActive) {
    throw new ProjectAttendanceError('Employee not found', 404);
  }

  if (employee.attendanceCategory === AttendanceCategory.LABOR && !isProxyPunch) {
    throw new ProjectAttendanceError(
      'Labor workers cannot self punch out. A supervisor must punch on their behalf.',
      403,
      'LABOR_SELF_PUNCH_FORBIDDEN',
    );
  }

  if (isProxyPunch && !isSupervisorRole(actor.role)) {
    throw new ProjectAttendanceError(
      'Only supervisors can punch out for other employees.',
      403,
      'SUPERVISOR_REQUIRED',
    );
  }

  const open = await prisma.projectAttendanceLog.findFirst({
    where: {
      employeeId: employee.id,
      punchOut: null,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
    orderBy: { punchIn: 'desc' },
  });

  if (!open) {
    throw new ProjectAttendanceError('No open site shift found for this employee.', 404, 'NO_OPEN_SHIFT');
  }

  let punchOutLat: number | undefined;
  let punchOutLng: number | undefined;

  if (input.latitude != null && input.longitude != null) {
    const gps = validateGpsInput(input.latitude, input.longitude);
    if (gps.ok) {
      punchOutLat = gps.latitude;
      punchOutLng = gps.longitude;
      const site = await resolveProjectSiteCoords(open.projectId);
      if (site) {
        const geo = assertWithinProjectGeofence(gps.latitude, gps.longitude, site);
        if (!geo.ok) {
          throw new ProjectAttendanceError(geo.message, 403, 'OUTSIDE_GEOFENCE', {
            distance: geo.distance,
            allowedRadius: site.radiusMeters,
          });
        }
      }
    }
  }

  const closed = await closeOpenLog(open, new Date(), {
    autoClosed: false,
    punchOutLatitude: punchOutLat,
    punchOutLongitude: punchOutLng,
    employeeCategory: employee.attendanceCategory,
  });

  return { log: closed };
}

export async function getProjectLaborCost(projectId: string) {
  const agg = await prisma.projectAttendanceLog.aggregate({
    where: { projectId },
    _sum: { costAmount: true },
    _count: { id: true },
  });

  return {
    projectId,
    totalLaborCost: Number(agg._sum.costAmount ?? 0),
    logCount: agg._count.id,
  };
}

export async function listProjectSiteLogs(projectId: string, limit = 100) {
  return prisma.projectAttendanceLog.findMany({
    where: { projectId },
    orderBy: { punchIn: 'desc' },
    take: Math.min(limit, 500),
    include: logInclude,
  });
}

export async function listOpenSiteShifts(projectId?: string) {
  return prisma.projectAttendanceLog.findMany({
    where: {
      punchOut: null,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { punchIn: 'desc' },
    include: logInclude,
  });
}

export function formatSiteLog(log: ProjectAttendanceLog & {
  employee?: { id: string; firstName: string; lastName: string; employeeId: string | null; attendanceCategory: AttendanceCategory };
  supervisor?: { id: string; firstName: string; lastName: string } | null;
  project?: { id: string; name: string; referenceNumber: string; projectNumber: number };
}) {
  return {
    id: log.id,
    employeeId: log.employeeId,
    employeeName: log.employee
      ? `${log.employee.firstName} ${log.employee.lastName}`.trim()
      : undefined,
    employeeNumber: log.employee?.employeeId,
    attendanceCategory: log.employee?.attendanceCategory,
    projectId: log.projectId,
    projectName: log.project?.name,
    projectReference: log.project?.referenceNumber,
    projectNumber: log.project?.projectNumber,
    supervisorId: log.supervisorId,
    supervisorName: log.supervisor
      ? `${log.supervisor.firstName} ${log.supervisor.lastName}`.trim()
      : null,
    punchIn: log.punchIn,
    punchOut: log.punchOut,
    workedHours: log.workedHours,
    costAmount: Number(log.costAmount),
    latitude: log.latitude,
    longitude: log.longitude,
    distanceFromSiteM: log.distanceFromSiteM,
    faceVerified: log.faceVerified,
    autoClosed: log.autoClosed,
  };
}

export async function listActiveSiteProjects() {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ACTIVE_PROJECT_STATUSES },
    },
    select: {
      id: true,
      name: true,
      referenceNumber: true,
      projectNumber: true,
      siteLatitude: true,
      siteLongitude: true,
      geofenceRadiusM: true,
      contracts: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { latitude: true, longitude: true },
      },
    },
    orderBy: { referenceNumber: 'asc' },
  });

  return projects
    .map((p) => {
      let lat = p.siteLatitude;
      let lng = p.siteLongitude;
      if ((lat == null || lng == null) && p.contracts[0]?.latitude != null) {
        lat = Number(p.contracts[0].latitude);
        lng = Number(p.contracts[0].longitude);
      }
      if (lat == null || lng == null) return null;
      return {
        id: p.id,
        name: p.name,
        referenceNumber: p.referenceNumber,
        projectNumber: p.projectNumber,
        siteLatitude: lat,
        siteLongitude: lng,
        geofenceRadiusM: p.geofenceRadiusM ?? 100,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
}

export async function listLaborWorkersForSite(search?: string) {
  const q = search?.trim();
  const workers = await prisma.user.findMany({
    where: {
      isActive: true,
      attendanceCategory: AttendanceCategory.LABOR,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { employeeId: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      photo: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 200,
  });

  if (workers.length === 0) return [];

  const openLogs = await prisma.projectAttendanceLog.findMany({
    where: {
      employeeId: { in: workers.map((w) => w.id) },
      punchOut: null,
    },
    select: {
      id: true,
      employeeId: true,
      projectId: true,
      punchIn: true,
      project: { select: { referenceNumber: true, name: true } },
    },
  });

  const openByEmployee = new Map(openLogs.map((l) => [l.employeeId, l]));

  return workers.map((w) => {
    const open = openByEmployee.get(w.id);
    return {
      id: w.id,
      name: `${w.firstName} ${w.lastName}`.trim(),
      employeeNumber: w.employeeId,
      photo: w.photo,
      hasPhoto: Boolean(w.photo),
      openShift: open
        ? {
            logId: open.id,
            projectId: open.projectId,
            projectReference: open.project.referenceNumber,
            projectName: open.project.name,
            punchIn: open.punchIn,
          }
        : null,
    };
  });
}
