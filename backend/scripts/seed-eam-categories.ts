/**
 * Seed default asset categories for EAM.
 * Usage: npx ts-node scripts/seed-eam-categories.ts
 */
import prisma from '../src/config/database';

async function main() {
  const defaults = [
    { name: 'Laptop', minThreshold: 5, depreciationLifespanYears: 3, salvageValuePercentage: 10 },
    { name: 'Desktop PC', minThreshold: 3, depreciationLifespanYears: 4, salvageValuePercentage: 10 },
    { name: 'Mobile Phone', minThreshold: 5, depreciationLifespanYears: 2, salvageValuePercentage: 5 },
    { name: 'Monitor', minThreshold: 5, depreciationLifespanYears: 5, salvageValuePercentage: 10 },
    { name: 'Printer', minThreshold: 2, depreciationLifespanYears: 5, salvageValuePercentage: 15 },
    { name: 'Engineering Tools', minThreshold: 2, depreciationLifespanYears: 5, salvageValuePercentage: 10 },
    { name: 'Other', minThreshold: 0, depreciationLifespanYears: 3, salvageValuePercentage: 5 },
  ];

  for (const cat of defaults) {
    await prisma.assetCategory.upsert({
      where: { name: cat.name },
      create: cat,
      update: {
        minThreshold: cat.minThreshold,
        depreciationLifespanYears: cat.depreciationLifespanYears,
        salvageValuePercentage: cat.salvageValuePercentage,
      },
    });
    console.log('Category:', cat.name);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
