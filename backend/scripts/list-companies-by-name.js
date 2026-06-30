const prisma = require('../dist/config/database').default || require('../dist/config/database');

async function main() {
  const q = (process.argv[2] || '').trim();
  if (!q) {
    console.error('Usage: node scripts/list-companies-by-name.js <searchText>');
    process.exit(2);
  }

  const rows = await prisma.company.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true, parentCompanyId: true },
    orderBy: { name: 'asc' },
    take: 200,
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
  });

