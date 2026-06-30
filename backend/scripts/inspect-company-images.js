const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    select: { name: true, letterhead: true, header: true, logo: true, footer: true },
  });
  for (const c of companies) {
    for (const field of ['letterhead', 'header', 'logo', 'footer']) {
      const v = c[field];
      if (!v) continue;
      const abs = path.join(process.cwd(), String(v).replace(/^\/+/, ''));
      const exists = fs.existsSync(abs);
      console.log(JSON.stringify({ company: c.name, field, rel: v, exists, size: exists ? fs.statSync(abs).size : 0 }));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
