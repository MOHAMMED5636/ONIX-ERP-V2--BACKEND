const { PrismaClient } = require('@prisma/client');

async function main() {
  const { resolveEmployeeCompanyRecords } = require('../dist/services/companyAccess.service');
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'mufazzal@onixgroup.ae' },
      select: { id: true },
    });
    if (!user) {
      console.log('user not found');
      return;
    }
    const matches = await resolveEmployeeCompanyRecords(user.id);
    console.log('matches:', matches);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
