const prisma = require('../dist/config/database').default || require('../dist/config/database');

async function main() {
  const dubaiId = (process.argv[2] || '0d649e36-35e4-4492-9d23-fa66a06a1a90').trim();
  const parentName = (process.argv[3] || 'ONIX ENGINEERING CONSULTANCY').trim();

  const dubai = await prisma.company.findUnique({
    where: { id: dubaiId },
    select: { id: true, name: true, parentCompanyId: true },
  });
  if (!dubai) throw new Error(`Dubai company not found: ${dubaiId}`);

  const parent = await prisma.company.findFirst({
    where: { name: { equals: parentName, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!parent) throw new Error(`Parent company not found by name: ${parentName}`);

  const updated = await prisma.company.update({
    where: { id: dubaiId },
    data: { parentCompanyId: parent.id },
    select: { id: true, name: true, parentCompanyId: true },
  });

  console.log('Before:', dubai);
  console.log('Parent:', parent);
  console.log('Updated:', updated);
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

