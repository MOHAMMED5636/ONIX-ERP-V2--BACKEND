import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirst({
    where: { referenceNumber: '2583' },
    select: { id: true, referenceNumber: true, siteLatitude: true, siteLongitude: true },
  });
  const pm = await prisma.user.findFirst({
    where: { email: 'ramez@onixgroup.ae' },
    select: { id: true, email: true, role: true, attendanceCategory: true },
  });
  const labor = await prisma.user.findFirst({
    where: { email: 'abdulrazzaq@onixgroup.ae' },
    select: { id: true, email: true, attendanceCategory: true, photo: true },
  });
  console.log(JSON.stringify({ project, pm, labor }, null, 2));
}

main().finally(() => prisma.$disconnect());
