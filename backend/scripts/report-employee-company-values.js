const prisma = require('../dist/config/database').default || require('../dist/config/database');

async function main() {
  const total = await prisma.user.count({
    where: { role: { notIn: ['TENDER_ENGINEER'] } },
  });
  const active = await prisma.user.count({
    where: { role: { notIn: ['TENDER_ENGINEER'] }, isActive: true },
  });
  const missingCompany = await prisma.user.count({
    where: { role: { notIn: ['TENDER_ENGINEER'] }, isActive: true, OR: [{ company: null }, { company: '' }] },
  });
  const byCompany = await prisma.user.groupBy({
    by: ['company'],
    where: { role: { notIn: ['TENDER_ENGINEER'] }, isActive: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 30,
  });

  console.log('Employees (non-tender): total=', total, 'active=', active);
  console.log('Active with missing company=', missingCompany);
  console.log('Top company values (active):');
  for (const row of byCompany) {
    console.log('-', JSON.stringify(row.company), row._count.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });

