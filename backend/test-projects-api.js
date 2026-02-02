// Test the projects API endpoint
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testProjectsAPI() {
  try {
    console.log('🔍 Testing Projects API Logic...\n');
    
    // Simulate the getAllProjects query
    const where = {}; // No filters
    
    const pageNum = 1;
    const limitNum = 10;
    const skip = (pageNum - 1) * limitNum;
    
    console.log('Query parameters:');
    console.log(`  Page: ${pageNum}, Limit: ${limitNum}, Skip: ${skip}`);
    console.log(`  Where clause:`, where);
    
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          projectManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);
    
    console.log(`\n📊 Results:`);
    console.log(`  Total projects found: ${total}`);
    console.log(`  Projects returned: ${projects.length}`);
    
    if (projects.length > 0) {
      console.log(`\n📋 Projects:`);
      projects.forEach((project, i) => {
        console.log(`  ${i + 1}. ${project.name} (${project.referenceNumber}) - Status: ${project.status}`);
        console.log(`     Client: ${project.client?.name || 'N/A'}`);
        console.log(`     Manager: ${project.projectManager ? `${project.projectManager.firstName} ${project.projectManager.lastName}` : 'N/A'}`);
      });
    } else {
      console.log('\n⚠️  No projects returned!');
      
      // Check if projects exist without filters
      const allProjects = await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          referenceNumber: true,
          status: true,
        }
      });
      
      console.log(`\n🔍 Checking raw projects (no filters):`);
      console.log(`  Found ${allProjects.length} projects in database`);
      if (allProjects.length > 0) {
        allProjects.forEach((p, i) => {
          console.log(`    ${i + 1}. ${p.name} (${p.referenceNumber}) - ${p.status}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testProjectsAPI();

