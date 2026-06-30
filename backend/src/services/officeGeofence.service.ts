import { AttendanceCategory, Company, User, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { checkProximity, isValidCoordinates } from '../utils/location.utils';

/** Super Admin may bypass office geofence for support/testing */
const GEOFENCE_EXEMPT_ROLES: UserRole[] = [UserRole.SUPER_ADMIN];

export async function resolveCompanyForAttendanceUser(
  user: Pick<User, 'company'>,
): Promise<Company | null> {
  if (user.company) {
    const byName = await prisma.company.findFirst({ where: { name: user.company } });
    if (byName) return byName;
  }
  return prisma.company.findFirst();
}

export function userRequiresOfficeGeofence(
  user: Pick<User, 'attendanceCategory' | 'role'>,
  company: {
    requireOfficeGeofence?: boolean | null;
    officeLatitude?: number | null;
    officeLongitude?: number | null;
  } | null,
): boolean {
  if (!company) return false;
  if (company.requireOfficeGeofence === false) return false;
  if (company.officeLatitude == null || company.officeLongitude == null) return false;
  if (
    user.attendanceCategory === AttendanceCategory.SITE ||
    user.attendanceCategory === AttendanceCategory.LABOR
  ) {
    return false;
  }
  if (GEOFENCE_EXEMPT_ROLES.includes(user.role)) return false;
  return true;
}

export type OfficeGeofenceResult =
  | { ok: true; distance: number | null; isWithinRadius: boolean | null; allowedRadius: number }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      distance?: number;
      allowedRadius?: number;
    };

export function validateOfficeGeofence(
  user: Pick<User, 'attendanceCategory' | 'role'>,
  company: {
    requireOfficeGeofence?: boolean | null;
    officeLatitude?: number | null;
    officeLongitude?: number | null;
    attendanceRadius?: number | null;
    name?: string | null;
  } | null,
  latitude: unknown,
  longitude: unknown,
): OfficeGeofenceResult {
  const required = userRequiresOfficeGeofence(user, company);

  if (!required) {
    if (latitude === undefined || longitude === undefined) {
      return { ok: true, distance: null, isWithinRadius: null, allowedRadius: company?.attendanceRadius ?? 200 };
    }
    const lat = typeof latitude === 'number' ? latitude : parseFloat(String(latitude));
    const lng = typeof longitude === 'number' ? longitude : parseFloat(String(longitude));
    if (!isValidCoordinates(lat, lng)) {
      return { ok: true, distance: null, isWithinRadius: null, allowedRadius: company?.attendanceRadius ?? 200 };
    }
    if (company?.officeLatitude != null && company?.officeLongitude != null) {
      const allowedRadius = company.attendanceRadius ?? 200;
      const proximity = checkProximity(
        lat,
        lng,
        company.officeLatitude,
        company.officeLongitude,
        allowedRadius,
      );
      return {
        ok: true,
        distance: proximity.distance,
        isWithinRadius: proximity.isWithinRadius,
        allowedRadius,
      };
    }
    return { ok: true, distance: null, isWithinRadius: null, allowedRadius: 200 };
  }

  const lat = typeof latitude === 'number' ? latitude : parseFloat(String(latitude ?? ''));
  const lng = typeof longitude === 'number' ? longitude : parseFloat(String(longitude ?? ''));

  if (!isValidCoordinates(lat, lng)) {
    return {
      ok: false,
      status: 400,
      code: 'GPS_REQUIRED',
      message:
        'GPS location is required to mark attendance. Allow location in your browser and refresh this page.',
    };
  }

  const allowedRadius = company!.attendanceRadius ?? 200;
  const proximity = checkProximity(
    lat,
    lng,
    company!.officeLatitude!,
    company!.officeLongitude!,
    allowedRadius,
  );

  if (!proximity.isWithinRadius) {
    const label = company!.name?.trim() || 'the office';
    return {
      ok: false,
      status: 403,
      code: 'OUTSIDE_OFFICE_GEOFENCE',
      message: `You must be within ${allowedRadius} meters of ${label} to mark attendance. Your current distance is ${proximity.distance.toFixed(0)} meters.`,
      distance: proximity.distance,
      allowedRadius,
    };
  }

  return {
    ok: true,
    distance: proximity.distance,
    isWithinRadius: true,
    allowedRadius,
  };
}
