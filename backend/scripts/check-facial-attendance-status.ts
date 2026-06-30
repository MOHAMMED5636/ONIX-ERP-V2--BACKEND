import prisma from '../src/config/database';

async function main() {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      requireFacialAttendance: true,
      facialMatchMinScore: true,
    },
    take: 20,
  });

  console.log('ATTENDANCE_REQUIRE_FACIAL env:', process.env.ATTENDANCE_REQUIRE_FACIAL ?? '(not set)');

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = 'companies' AND column_name IN ('requireFacialAttendance', 'facialMatchMinScore')`,
  );
  console.log('DB columns on companies:', cols.map((c) => c.column_name));

  const attCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = 'attendances' AND column_name IN ('faceVerified', 'faceMatchScore', 'facePhotoPath')`,
  );
  console.log('DB columns on attendances:', attCols.map((c) => c.column_name));

  console.log('\nCompanies facial settings:');
  for (const c of companies) {
    console.log(` - ${c.name}: required=${c.requireFacialAttendance}, minScore=${c.facialMatchMinScore}`);
  }

  const verified = await prisma.attendance.count({ where: { faceVerified: true } });
  const withScore = await prisma.attendance.count({ where: { faceMatchScore: { not: null } } });
  console.log(`\nAttendance records with faceVerified=true: ${verified}`);
  console.log(`Attendance records with faceMatchScore set: ${withScore}`);

  const recent = await prisma.attendance.findMany({
    where: { faceVerified: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      date: true,
      type: true,
      faceMatchScore: true,
      deviceInfo: true,
      createdAt: true,
    },
  });
  console.log('\nRecent face-verified attendance:', recent);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
