// Quick script to check projects in database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProjects() {
  try {
    console.log('🔍 Checking projects in database...\n');
    
    // Count all projects
    const totalProjects = await prisma.project.count();
    console.log(`📊 Total Projects: ${totalProjects}`);
    
    // Count active projects
    const activeProjects = await prisma.project.count({
      where: {
        status: {
          in: ['OPEN', 'IN_PROGRESS']
        }
      }
    });
    console.log(`📊 Active Projects (OPEN or IN_PROGRESS): ${activeProjects}`);
    
    // Get all projects with details
    const allProjects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`\n📋 All Projects (${allProjects.length}):`);
    if (allProjects.length === 0) {
      console.log('   ✅ No projects found in database');
    } else {
      allProjects.forEach((project, index) => {
        console.log(`   ${index + 1}. ${project.name} (${project.referenceNumber}) - Status: ${project.status}`);
      });
    }
    
    // Group by status
    const byStatus = await prisma.project.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });
    
    console.log(`\n📊 Projects by Status:`);
    byStatus.forEach(group => {
      console.log(`   ${group.status}: ${group._count.id}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProjects();

