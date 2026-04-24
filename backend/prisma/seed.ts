/// <reference types="node" />
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

  // Create Anas Ali tender engineer
  const anasPassword = await bcrypt.hash('anas@123', 10);
  const anas = await prisma.user.upsert({
    where: { email: 'anas.ali@onixgroup.ae' },
    update: {},
    create: {
      email: 'anas.ali@onixgroup.ae',
      password: anasPassword,
      firstName: 'Anas',
      lastName: 'Ali',
      role: 'TENDER_ENGINEER',
    },
  });
  console.log('✅ Created Anas Ali tender engineer:', anas.email);

  // Kaddour account removed from seed — disable ERP access if row still exists (legacy DBs).
  const kaddourDisabled = await prisma.user.updateMany({
    where: { email: 'kaddour@onixgroup.ae' },
    data: {
      isActive: false,
      userAccount: false,
    },
  });
  if (kaddourDisabled.count > 0) {
    console.log('✅ Disabled ERP login for kaddour@onixgroup.ae (legacy row)');
  }

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

  // Create HR admin user
  const hrPassword = await bcrypt.hash('159753', 10);
  const hr = await prisma.user.upsert({
    where: { email: 'hr@onixgroup.ae' },
    update: {},
    create: {
      email: 'hr@onixgroup.ae',
      password: hrPassword,
      firstName: 'HR',
      lastName: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created HR admin user:', hr.email);

  // Create H. Obada admin user
  const obadaPassword = await bcrypt.hash('147369', 10);
  const obada = await prisma.user.upsert({
    where: { email: 'h.obada@onixgroup.ae' },
    update: {},
    create: {
      email: 'h.obada@onixgroup.ae',
      password: obadaPassword,
      firstName: 'H.',
      lastName: 'Obada',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created H. Obada admin user:', obada.email);

  // Create Muffazzal project manager
  const muffazzalPassword = await bcrypt.hash('muffazzal123', 10);
  const muffazzal = await prisma.user.upsert({
    where: { email: 'muffazzal@onixgroup.ae' },
    update: { role: 'PROJECT_MANAGER' },
    create: {
      email: 'muffazzal@onixgroup.ae',
      password: muffazzalPassword,
      firstName: 'Muffazzal',
      lastName: 'User',
      role: 'PROJECT_MANAGER',
    },
  });
  console.log('✅ Created Muffazzal project manager:', muffazzal.email);

  // Create Info admin user
  const infoPassword = await bcrypt.hash('123789', 10);
  const info = await prisma.user.upsert({
    where: { email: 'info@onixgroup.ae' },
    update: {},
    create: {
      email: 'info@onixgroup.ae',
      password: infoPassword,
      firstName: 'Info',
      lastName: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created Info admin user:', info.email);

  // Create test employee (for Employee ERP login)
  const employeePassword = await bcrypt.hash('employee123', 10);
  const employee = await prisma.user.upsert({
    where: { email: 'employee@onixgroup.ae' },
    update: {},
    create: {
      email: 'employee@onixgroup.ae',
      password: employeePassword,
      firstName: 'Test',
      lastName: 'Employee',
      role: 'EMPLOYEE',
    },
  });
  console.log('✅ Created test employee user:', employee.email);

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
      status: 'OPEN',
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
      status: 'OPEN',
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
      status: 'IN_PROGRESS',
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

  // Leave policies (UAE labor law compliant)
  const leavePolicies = [
    {
      leaveType: 'ANNUAL' as const,
      name: 'Annual Leave',
      description: 'Paid annual leave. 2 days per month after probation (<12 months service). 30 paid working days after 12 months. Carry-forward max 2 periods. 30 days advance notice. Management may reschedule (max 3 months).',
      config: {
        probationMonths: 6,
        daysPerMonthUnder12Months: 2,
        annualDaysAfter12Months: 30,
        carryForwardPeriods: 2,
        advanceNoticeDays: 30,
        maxRescheduleMonths: 3,
        absencesNotCounted: true,
        compliance: 'UAE_LABOR_LAW',
      },
    },
    {
      leaveType: 'SICK' as const,
      name: 'Sick Leave',
      description: 'Up to 90 days total: 15 full pay, 30 half pay, 45 unpaid. Report absence within 24 hours; medical report within 3 working days.',
      config: {
        totalDaysPerYear: 90,
        fullPayDays: 15,
        halfPayDays: 30,
        unpaidDays: 45,
        reportAbsenceWithinHours: 24,
        medicalReportWithinWorkingDays: 3,
        compliance: 'UAE_LABOR_LAW',
      },
    },
    {
      leaveType: 'UNPAID' as const,
      name: 'Unpaid Leave',
      description: 'Unpaid leave. No balance limit. Subject to approval.',
      config: {
        noBalanceLimit: true,
        compliance: 'UAE_LABOR_LAW',
      },
    },
    {
      leaveType: 'EMERGENCY' as const,
      name: 'Emergency Leave',
      description: 'Leave for urgent family or personal circumstances. Report as soon as practicable.',
      config: {
        reportRequired: true,
        documentationRecommended: true,
        compliance: 'UAE_LABOR_LAW',
      },
    },
    {
      leaveType: 'BEREAVEMENT' as const,
      name: 'Bereavement Leave',
      description: '5 days for spouse; 3 days for first-degree relatives. Documentation may be required.',
      config: {
        spouseDays: 5,
        firstDegreeDays: 3,
        relationRequired: true,
        relationOptions: ['spouse', 'first_degree'],
        compliance: 'UAE_LABOR_LAW',
      },
    },
    {
      leaveType: 'PATERNITY' as const,
      name: 'Paternity Leave',
      description: '5 paid days within the first 6 months of childbirth.',
      config: {
        paidDays: 5,
        withinMonthsOfChildbirth: 6,
        documentationRequired: true,
        compliance: 'UAE_LABOR_LAW',
      },
    },
    {
      leaveType: 'MATERNITY' as const,
      name: 'Maternity Leave',
      description: '105 days total: 45 full pay, 15 half pay, 45 unpaid. 45 additional unpaid days if mother or child ill due to childbirth, with proof.',
      config: {
        totalDays: 105,
        maternityFullPayDays: 45,
        maternityHalfPayDays: 15,
        maternityUnpaidDays: 45,
        extraUnpaidWithProof: 45,
        documentationRequiredForExtra: true,
        compliance: 'UAE_LABOR_LAW',
      },
    },
  ];

  for (const p of leavePolicies) {
    await prisma.leavePolicy.upsert({
      where: { leaveType: p.leaveType },
      update: { name: p.name, description: p.description, config: p.config as object },
      create: {
        leaveType: p.leaveType,
        name: p.name,
        description: p.description,
        config: p.config as object,
      },
    });
  }
  console.log('✅ Created/updated leave policies (UAE compliant)');

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

