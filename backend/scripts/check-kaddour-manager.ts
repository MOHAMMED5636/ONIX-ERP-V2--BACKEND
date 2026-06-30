import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  const u = await prisma.user.findFirst({
    where: { email: 'kaddour@onixgroup.ae' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      managerId: true,
      drivingLicenseNumber: true,
      manager: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
    },
  });
  console.log(JSON.stringify(u, null, 2));
  if (u?.managerId) {
    const m = await prisma.user.findUnique({ where: { id: u.managerId } });
    console.log('Manager lookup:', m ? 'FOUND' : 'NOT FOUND', u.managerId);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
