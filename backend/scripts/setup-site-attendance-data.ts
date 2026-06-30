import { PrismaClient, ProjectStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS, ProjectStatus.SUBMITTED_IN_PROGRESS] },
    },
    take: 10,
    select: {
      id: true,
      name: true,
      referenceNumber: true,
      siteLatitude: true,
      siteLongitude: true,
      contracts: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { latitude: true, longitude: true },
      },
    },
  });

  const pms = await prisma.user.findMany({
    where: { role: UserRole.PROJECT_MANAGER, isActive: true },
    take: 5,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      attendanceCategory: true,
    },
  });

  const managers = await prisma.user.findMany({
    where: { role: UserRole.MANAGER, isActive: true },
    take: 5,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      attendanceCategory: true,
    },
  });

  const laborCandidates = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.CONTRACTOR, UserRole.EMPLOYEE] },
    },
    take: 15,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isLabour: true,
      photo: true,
      attendanceCategory: true,
      labourDetails: { select: { hourlyRate: true, id: true, basicSalary: true } },
    },
  });

  const withLabourDetails = await prisma.user.findMany({
    where: { isActive: true, labourDetails: { isNot: null } },
    take: 10,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isLabour: true,
      photo: true,
      labourDetails: { select: { hourlyRate: true, basicSalary: true } },
    },
  });

  console.log(JSON.stringify({ projects, pms, managers, laborCandidates, withLabourDetails }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
