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

  // Create Kaddour user
  const kaddourPassword = await bcrypt.hash('kadoour123', 10);
  const kaddour = await prisma.user.upsert({
    where: { email: 'kaddour@onixgroup.ae' },
    update: {},
    create: {
      email: 'kaddour@onixgroup.ae',
      password: kaddourPassword,
      firstName: 'Kaddour',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created Kaddour user:', kaddour.email);

  // Create Ramiz user
  const ramizPassword = await bcrypt.hash('ramiz@123', 10);
  const ramiz = await prisma.user.upsert({
    where: { email: 'ramiz@onixgroup.ae' },
    update: {},
    create: {
      email: 'ramiz@onixgroup.ae',
      password: ramizPassword,
      firstName: 'Ramiz',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created Ramiz user:', ramiz.email);

  // Create sample clients
  const client1 = await prisma.client.upsert({
    where: { referenceNumber: 'CLI-001' },
    update: {},
    create: {
      referenceNumber: 'CLI-001',
      name: 'ABC Construction Company',
      isCorporate: 'Company',
      email: 'contact@abcconstruction.com',
      phone: '+971501234567',
      address: 'Dubai, UAE',
      nationality: 'UAE',
    },
  });
  console.log('✅ Created client:', client1.name);

  const client2 = await prisma.client.upsert({
    where: { referenceNumber: 'CLI-002' },
    update: {},
    create: {
      referenceNumber: 'CLI-002',
      name: 'XYZ Engineering Ltd',
      isCorporate: 'Company',
      email: 'info@xyzengineering.com',
      phone: '+971507654321',
      address: 'Abu Dhabi, UAE',
      nationality: 'UAE',
    },
  });
  console.log('✅ Created client:', client2.name);

  // Create sample projects
  const project1 = await prisma.project.upsert({
    where: { referenceNumber: 'PRJ-001' },
    update: {},
    create: {
      referenceNumber: 'PRJ-001',
      name: 'Dubai Marina Tower',
      clientId: client1.id,
      description: 'High-rise residential tower project',
      status: 'Open',
      deadline: new Date('2025-12-31'),
      createdBy: admin.id,
    },
  });
  console.log('✅ Created project:', project1.name);

  const project2 = await prisma.project.upsert({
    where: { referenceNumber: 'PRJ-002' },
    update: {},
    create: {
      referenceNumber: 'PRJ-002',
      name: 'Abu Dhabi Office Complex',
      clientId: client2.id,
      description: 'Commercial office complex development',
      status: 'Open',
      deadline: new Date('2025-11-30'),
      createdBy: admin.id,
    },
  });
  console.log('✅ Created project:', project2.name);

  const project3 = await prisma.project.upsert({
    where: { referenceNumber: 'PRJ-003' },
    update: {},
    create: {
      referenceNumber: 'PRJ-003',
      name: 'Sharjah Residential Complex',
      clientId: client1.id,
      description: 'Residential complex with 200 units',
      status: 'In Progress',
      deadline: new Date('2026-01-15'),
      createdBy: admin.id,
    },
  });
  console.log('✅ Created project:', project3.name);

  // Create sample tenders
  const tender1 = await prisma.tender.upsert({
    where: { referenceNumber: 'TDR-001' },
    update: {},
    create: {
      referenceNumber: 'TDR-001',
      name: 'Structural Engineering Services',
      projectId: project1.id,
      clientId: client1.id,
      status: 'OPEN',
      scopeOfWork: 'Complete structural design and analysis',
      bidSubmissionDeadline: new Date('2025-12-15'),
      tenderAcceptanceDeadline: new Date('2025-12-10'),
    },
  });
  console.log('✅ Created tender:', tender1.name);

  const tender2 = await prisma.tender.upsert({
    where: { referenceNumber: 'TDR-002' },
    update: {},
    create: {
      referenceNumber: 'TDR-002',
      name: 'MEP Design Services',
      projectId: project2.id,
      clientId: client2.id,
      status: 'OPEN',
      scopeOfWork: 'MEP design and coordination',
      bidSubmissionDeadline: new Date('2025-12-20'),
      tenderAcceptanceDeadline: new Date('2025-12-15'),
    },
  });
  console.log('✅ Created tender:', tender2.name);

  // Create tender invitation
  const invitation = await prisma.tenderInvitation.create({
    data: {
      tenderId: tender1.id,
      engineerId: engineer.id,
      invitationToken: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      status: 'PENDING',
    },
  });
  console.log('✅ Created tender invitation for engineer');

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

