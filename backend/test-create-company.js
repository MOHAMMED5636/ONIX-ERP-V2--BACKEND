// Test company creation with sample data
const { PrismaClient, CompanyStatus, LicenseStatus } = require('@prisma/client');
const prisma = new PrismaClient();

async function testCreateCompany() {
  try {
    console.log('🧪 Testing company creation...\n');
    
    const testData = {
      name: 'Test Company',
      tag: 'TEST',
      address: 'Test Address',
      industry: 'Technology',
      status: CompanyStatus.ACTIVE,
      contactName: 'Test Contact',
      contactEmail: 'test@example.com',
      contactPhone: '+971-50-123-4567',
      licenseStatus: LicenseStatus.ACTIVE,
      employees: 0,
    };
    
    console.log('Creating company with data:', testData);
    
    const company = await prisma.company.create({
      data: testData,
    });
    
    console.log('✅ Company created successfully:', company);
    
    // Clean up - delete test company
    await prisma.company.delete({
      where: { id: company.id }
    });
    
    console.log('✅ Test company deleted');
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testCreateCompany();

