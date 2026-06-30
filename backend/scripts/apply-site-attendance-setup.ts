/**
 * One-time setup for smart site attendance testing:
 * 1. Copy contract GPS → project siteLatitude/siteLongitude
 * 2. Set all PROJECT_MANAGER users → attendanceCategory SITE
 * 3. Set isLabour employees → LABOR + create labour_details with hourlyRate
 */
import { AttendanceCategory, PrismaClient, ProjectStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_HOURLY_RATE = 15;

async function syncProjectGpsFromContracts() {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS, ProjectStatus.SUBMITTED_IN_PROGRESS] },
      OR: [{ siteLatitude: null }, { siteLongitude: null }],
    },
    include: {
      contracts: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { latitude: true, longitude: true },
      },
    },
  });

  let updated = 0;
  for (const project of projects) {
    const c = project.contracts[0];
    if (c?.latitude == null || c?.longitude == null) continue;

    await prisma.project.update({
      where: { id: project.id },
      data: {
        siteLatitude: Number(c.latitude),
        siteLongitude: Number(c.longitude),
        geofenceRadiusM: project.geofenceRadiusM ?? 100,
      },
    });
    updated++;
    console.log(`  GPS: ${project.referenceNumber} → ${Number(c.latitude)}, ${Number(c.longitude)}`);
  }
  return updated;
}

async function setProjectManagersToSite() {
  const result = await prisma.user.updateMany({
    where: { role: UserRole.PROJECT_MANAGER, isActive: true },
    data: { attendanceCategory: AttendanceCategory.SITE },
  });
  return result.count;
}

async function findLaborTestWorkers() {
  // Prefer explicit isLabour flag
  const flagged = await prisma.user.findMany({
    where: { isActive: true, isLabour: true },
    select: { id: true, firstName: true, lastName: true, email: true, photo: true },
  });
  if (flagged.length > 0) return flagged;

  // Employees assigned to active projects (likely field staff)
  const assignedIds = await prisma.projectAssignment.findMany({
    where: {
      project: {
        deletedAt: null,
        status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS, ProjectStatus.SUBMITTED_IN_PROGRESS] },
      },
      employee: { isActive: true, role: UserRole.EMPLOYEE },
    },
    distinct: ['employeeId'],
    take: 5,
    select: { employeeId: true },
  });

  if (assignedIds.length > 0) {
    const assigned = await prisma.user.findMany({
      where: { id: { in: assignedIds.map((a) => a.employeeId) } },
      select: { id: true, firstName: true, lastName: true, email: true, photo: true },
    });
    console.log(`  Using ${assigned.length} project-assigned employee(s) as LABOR test workers.`);
    return assigned;
  }

  // Last resort for testing: up to 3 active employees with profile photos (face punch ready)
  const withPhoto = await prisma.user.findMany({
    where: {
      isActive: true,
      role: UserRole.EMPLOYEE,
      photo: { not: null },
      NOT: { photo: '' },
    },
    take: 3,
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true, email: true, photo: true },
  });
  if (withPhoto.length > 0) {
    console.log(`  No isLabour workers found — using ${withPhoto.length} employee(s) with profile photos for LABOR testing.`);
    await prisma.user.updateMany({
      where: { id: { in: withPhoto.map((u) => u.id) } },
      data: { isLabour: true },
    });
    return withPhoto;
  }

  return [];
}

async function setFieldLaborWorkers() {
  const workers = await findLaborTestWorkers();

  let labourDetailsCreated = 0;
  for (const w of workers) {
    await prisma.user.update({
      where: { id: w.id },
      data: { attendanceCategory: AttendanceCategory.LABOR },
    });

    await prisma.labourDetails.upsert({
      where: { userId: w.id },
      create: { userId: w.id, hourlyRate: DEFAULT_HOURLY_RATE },
      update: { hourlyRate: DEFAULT_HOURLY_RATE },
    });
    labourDetailsCreated++;

    const label = `${w.firstName} ${w.lastName}`.trim();
    const photoNote = w.photo ? 'has photo' : 'NO PHOTO — enroll before face punch';
    console.log(`  LABOR: ${label} (${w.email}) — AED ${DEFAULT_HOURLY_RATE}/hr — ${photoNote}`);
  }

  return { workersUpdated: workers.length, labourDetailsCreated };
}

async function main() {
  console.log('=== Site attendance data setup ===\n');

  console.log('1) Sync project GPS from contracts...');
  const gpsCount = await syncProjectGpsFromContracts();
  console.log(`   Updated ${gpsCount} project(s)\n`);

  console.log('2) Set PROJECT_MANAGER → SITE attendance category...');
  const pmCount = await setProjectManagersToSite();
  console.log(`   Updated ${pmCount} project manager(s)\n`);

  console.log('3) Set isLabour employees → LABOR + hourly rate...');
  const labor = await setFieldLaborWorkers();
  console.log(`   Updated ${labor.workersUpdated} worker(s), labour_details: ${labor.labourDetailsCreated}\n`);

  console.log('=== Done ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
