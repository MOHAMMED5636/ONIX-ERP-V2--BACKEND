// Quick script to check companies in database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCompanies() {
  try {
    console.log('🔍 Checking companies in database...\n');
    
    // Count all companies
    const totalCompanies = await prisma.company.count();
    console.log(`📊 Total Companies: ${totalCompanies}`);
    
    // Count active companies
    const activeCompanies = await prisma.company.count({
      where: {
        status: 'ACTIVE'
      }
    });
    console.log(`📊 Active Companies: ${activeCompanies}`);
    
    // Get all companies with details
    const allCompanies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        tag: true,
        status: true,
        licenseStatus: true,
        employees: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`\n📋 All Companies (${allCompanies.length}):`);
    if (allCompanies.length === 0) {
      console.log('   ✅ No companies found in database');
    } else {
      allCompanies.forEach((company, index) => {
        console.log(`   ${index + 1}. ${company.name} (${company.tag || 'N/A'}) - Status: ${company.status}, License: ${company.licenseStatus}, Employees: ${company.employees}`);
      });
    }
    
    // Group by status
    const byStatus = await prisma.company.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });
    
    console.log(`\n📊 Companies by Status:`);
    byStatus.forEach(group => {
      console.log(`   ${group.status}: ${group._count.id}`);
    });
    
    // Group by license status
    const byLicenseStatus = await prisma.company.groupBy({
      by: ['licenseStatus'],
      _count: {
        id: true
      }
    });
    
    console.log(`\n📊 Companies by License Status:`);
    byLicenseStatus.forEach(group => {
      console.log(`   ${group.licenseStatus}: ${group._count.id}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.message && error.message.includes('does not exist')) {
      console.error('\n⚠️  Company model does not exist yet.');
      console.error('   Run migrations first: npx prisma migrate dev');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkCompanies();

