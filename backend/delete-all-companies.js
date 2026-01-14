// Script to delete all companies from database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllCompanies() {
  try {
    console.log('🗑️  Deleting all companies from database...\n');
    
    // First, check what we're deleting
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        tag: true,
        status: true
      }
    });
    
    console.log(`Found ${companies.length} companies to delete:`);
    companies.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.tag || 'N/A'}) - ${c.status}`);
    });
    
    if (companies.length === 0) {
      console.log('\n✅ No companies to delete. Database is already empty.');
      return;
    }
    
    // Delete all companies
    const result = await prisma.company.deleteMany({});
    
    console.log(`\n✅ Deleted ${result.count} company/companies from database`);
    
    // Verify deletion
    const remaining = await prisma.company.count();
    console.log(`\n📊 Remaining companies: ${remaining}`);
    
    if (remaining === 0) {
      console.log('✅ Database is now empty. Companies list should show 0.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.message && error.message.includes('does not exist')) {
      console.error('   Company model may not exist yet. Run migrations first:');
      console.error('   npx prisma migrate dev');
    }
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllCompanies();

