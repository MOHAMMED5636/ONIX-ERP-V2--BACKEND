/**
 * Data migration: Copy company-level customization to OrganizationPreferences (Admin Profile).
 * Run once after deploying the organization_preferences table.
 * Usage: npx ts-node scripts/migrate-company-preferences-to-organization.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prefs = await prisma.organizationPreferences.findFirst();
  if (!prefs) {
    console.log('No organization_preferences row found. Run prisma migrate first.');
    return;
  }

  // Get first company that has any preference set (non-default)
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { defaultCurrency: { not: null } },
        { lengthUnit: { not: null } },
        { areaUnit: { not: null } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  });

  if (companies.length === 0) {
    console.log('No company-level preferences found. Keeping default organization preferences.');
    return;
  }

  const company = companies[0];
  const updates: Record<string, string> = {};
  if (company.defaultCurrency) updates.defaultCurrency = company.defaultCurrency;
  if (company.lengthUnit) updates.lengthUnit = company.lengthUnit;
  if (company.areaUnit) updates.areaUnit = company.areaUnit;
  if (company.volumeUnit) updates.volumeUnit = company.volumeUnit;
  if (company.heightUnit) updates.heightUnit = company.heightUnit;
  if (company.weightUnit) updates.weightUnit = company.weightUnit;

  if (Object.keys(updates).length === 0) {
    console.log('Company has no preference overrides. Keeping default.');
    return;
  }

  await prisma.organizationPreferences.update({
    where: { id: prefs.id },
    data: updates,
  });
  console.log('Migrated company preferences to organization_preferences:', updates);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
