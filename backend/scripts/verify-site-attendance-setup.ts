import { AttendanceCategory, PrismaClient, ProjectStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const projectsWithGps = await prisma.project.count({
    where: {
      deletedAt: null,
      status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS, ProjectStatus.SUBMITTED_IN_PROGRESS] },
      siteLatitude: { not: null },
      siteLongitude: { not: null },
    },
  });

  const pmsSite = await prisma.user.count({
    where: { role: UserRole.PROJECT_MANAGER, attendanceCategory: AttendanceCategory.SITE },
  });

  const laborWorkers = await prisma.user.findMany({
    where: { attendanceCategory: AttendanceCategory.LABOR },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      labourDetails: { select: { hourlyRate: true } },
    },
  });

  const sampleProject = await prisma.project.findFirst({
    where: { referenceNumber: '2583' },
    select: { referenceNumber: true, name: true, siteLatitude: true, siteLongitude: true, geofenceRadiusM: true },
  });

  console.log(JSON.stringify({ projectsWithGps, pmsSite, laborWorkers, sampleProject }, null, 2));
}

main().finally(() => prisma.$disconnect());
