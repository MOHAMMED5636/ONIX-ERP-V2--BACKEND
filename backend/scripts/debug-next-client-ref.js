const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const year = new Date().getFullYear();
    const prefix = `O-CL-${year}/`;
    const rows = await prisma.client.findMany({
      where: { referenceNumber: { startsWith: prefix } },
      select: { referenceNumber: true },
      orderBy: { referenceNumber: 'asc' },
    });
    const used = new Set();
    let minUsed = null;
    for (const r of rows) {
      const parts = String(r.referenceNumber).split('/');
      const n = parseInt(parts[1], 10);
      if (Number.isFinite(n) && n > 0) {
        used.add(n);
        if (minUsed == null || n < minUsed) minUsed = n;
      }
    }
    let next = minUsed ?? 1;
    while (used.has(next)) next += 1;
    console.log('next_should_be', `${prefix}${String(next).padStart(4, '0')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

