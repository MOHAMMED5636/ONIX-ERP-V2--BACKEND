/**
 * Unpublish employee payslips for a month (keeps HR worksheet data).
 * Usage: npx ts-node scripts/unpublish-salary-month.ts 2026 6
 */
import { unpublishMonthlySalaryForPeriod } from '../src/services/salary-monthly-sheet.service';

async function main() {
  const year = parseInt(process.argv[2] || '', 10);
  const month = parseInt(process.argv[3] || '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    console.error('Usage: npx ts-node scripts/unpublish-salary-month.ts <year> <month>');
    process.exit(1);
  }
  const result = await unpublishMonthlySalaryForPeriod(year, month);
  console.log(`Unpublished ${result.unpublishedCount} salary line(s) for ${month}/${year}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = (await import('../src/config/database')).default;
    await prisma.$disconnect();
  });
