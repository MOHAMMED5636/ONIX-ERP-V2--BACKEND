import prisma from '../config/database';
import { ProjectStatus } from '@prisma/client';
import { checkProximity, isValidCoordinates } from '../utils/location.utils';

export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.OPEN,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.SUBMITTED_IN_PROGRESS,
];

export interface ProjectSiteCoords {
  projectId: string;
  projectName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export async function resolveProjectSiteCoords(projectId: string): Promise<ProjectSiteCoords | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      contracts: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { latitude: true, longitude: true },
      },
    },
  });

  if (!project) return null;

  const radiusMeters = project.geofenceRadiusM ?? 100;

  if (project.siteLatitude != null && project.siteLongitude != null) {
    return {
      projectId: project.id,
      projectName: project.name,
      latitude: project.siteLatitude,
      longitude: project.siteLongitude,
      radiusMeters,
    };
  }

  const contract = project.contracts[0];
  if (contract?.latitude != null && contract?.longitude != null) {
    return {
      projectId: project.id,
      projectName: project.name,
      latitude: Number(contract.latitude),
      longitude: Number(contract.longitude),
      radiusMeters,
    };
  }

  return null;
}

export function assertWithinProjectGeofence(
  userLat: number,
  userLng: number,
  site: Pick<ProjectSiteCoords, 'latitude' | 'longitude' | 'radiusMeters'>,
): { ok: true; distance: number } | { ok: false; distance: number; message: string } {
  const { isWithinRadius, distance } = checkProximity(
    userLat,
    userLng,
    site.latitude,
    site.longitude,
    site.radiusMeters,
  );

  if (!isWithinRadius) {
    return {
      ok: false,
      distance,
      message: `You must be within ${site.radiusMeters}m of the project site. Current distance: ${distance.toFixed(1)}m.`,
    };
  }

  return { ok: true, distance };
}

/** PM self-punch: find any active project within geofence when projectId is omitted. */
export async function findActiveProjectWithinGeofence(
  latitude: number,
  longitude: number,
): Promise<(ProjectSiteCoords & { distance: number }) | null> {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ACTIVE_PROJECT_STATUSES },
    },
    select: {
      id: true,
      name: true,
      siteLatitude: true,
      siteLongitude: true,
      geofenceRadiusM: true,
      contracts: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { latitude: true, longitude: true },
      },
    },
  });

  let best: (ProjectSiteCoords & { distance: number }) | null = null;

  for (const project of projects) {
    let lat = project.siteLatitude;
    let lng = project.siteLongitude;
    if (lat == null || lng == null) {
      const c = project.contracts[0];
      if (c?.latitude != null && c?.longitude != null) {
        lat = Number(c.latitude);
        lng = Number(c.longitude);
      }
    }
    if (lat == null || lng == null) continue;

    const radiusMeters = project.geofenceRadiusM ?? 100;
    const { isWithinRadius, distance } = checkProximity(latitude, longitude, lat, lng, radiusMeters);
    if (!isWithinRadius) continue;

    if (!best || distance < best.distance) {
      best = {
        projectId: project.id,
        projectName: project.name,
        latitude: lat,
        longitude: lng,
        radiusMeters,
        distance,
      };
    }
  }

  return best;
}

export function validateGpsInput(
  latitude: unknown,
  longitude: unknown,
): { ok: true; latitude: number; longitude: number } | { ok: false; message: string } {
  const lat = typeof latitude === 'number' ? latitude : parseFloat(String(latitude ?? ''));
  const lng = typeof longitude === 'number' ? longitude : parseFloat(String(longitude ?? ''));

  if (!isValidCoordinates(lat, lng)) {
    return { ok: false, message: 'Valid latitude and longitude are required for site attendance.' };
  }

  return { ok: true, latitude: lat, longitude: lng };
}
