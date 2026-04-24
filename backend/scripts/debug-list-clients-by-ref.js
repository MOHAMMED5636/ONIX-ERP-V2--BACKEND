const { PrismaClient } = require('@prisma/client');

async function main() {
  const prefix = process.argv[2] || 'O-CL-2026/';
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.client.findMany({
      where: { referenceNumber: { startsWith: prefix } },
      select: { referenceNumber: true, name: true, createdAt: true },
      orderBy: { referenceNumber: 'asc' },
    });
    console.log('prefix', prefix);
    console.log('count', rows.length);
    for (const r of rows) console.log(r.referenceNumber);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

