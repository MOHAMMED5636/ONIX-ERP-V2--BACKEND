import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@onixgroup.ae' },
    update: {},
    create: {
      email: 'admin@onixgroup.ae',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create tender engineer
  const engineerPassword = await bcrypt.hash('engineer@123', 10);
  const engineer = await prisma.user.upsert({
    where: { email: 'engineer@onixgroup.ae' },
    update: {},
    create: {
      email: 'engineer@onixgroup.ae',
      password: engineerPassword,
      firstName: 'Tender',
      lastName: 'Engineer',
      role: 'TENDER_ENGINEER',
    },
  });
  console.log('✅ Created engineer user:', engineer.email);

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

