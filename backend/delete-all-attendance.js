/**
 * Wipes ALL rows from the attendances table (fresh start for check-in/out data).
 * Run from backend folder: node delete-all-attendance.js
 * Requires DATABASE_URL in .env (same as the API).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.attendance.count();
  console.log(`📊 Current attendance records: ${count}`);

  if (count === 0) {
    console.log('✅ Nothing to delete.');
    return;
  }

  const result = await prisma.attendance.deleteMany({});
  console.log(`✅ Deleted ${result.count} attendance record(s). All users start with a clean attendance history.`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
