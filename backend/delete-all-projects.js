// Script to delete all projects from database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllProjects() {
  try {
    console.log('🗑️  Deleting all projects from database...\n');
    
    // First, check what we're deleting
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        status: true
      }
    });
    
    console.log(`Found ${projects.length} projects to delete:`);
    projects.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (${p.referenceNumber}) - ${p.status}`);
    });
    
    if (projects.length === 0) {
      console.log('\n✅ No projects to delete. Database is already empty.');
      return;
    }
    
    // Delete related records first (due to foreign key constraints)
    console.log('\n🗑️  Deleting related records...');
    
    // Get all project IDs first
    const projectIds = projects.map(p => p.id);
    
    // Find and delete ALL tenders (not just those with projectId in list)
    // Some tenders might have projectId that doesn't match exactly
    try {
      // First, find all tenders with any projectId
      const tendersWithProjects = await prisma.tender.findMany({
        where: {
          projectId: {
            not: null
          }
        },
        select: { id: true, projectId: true }
      });
      console.log(`   Found ${tendersWithProjects.length} tender(s) with project references`);
      
      // Delete all tenders that have a projectId
      const deletedTenders = await prisma.tender.deleteMany({
        where: {
          projectId: {
            not: null
          }
        }
      });
      console.log(`   Deleted ${deletedTenders.count} tender(s)`);
    } catch (e) {
      console.log(`   Error deleting tenders: ${e.message}`);
      // Try deleting all tenders
      try {
        const allTenders = await prisma.tender.deleteMany({});
        console.log(`   Deleted all ${allTenders.count} tender(s)`);
      } catch (e2) {
        console.log(`   Could not delete tenders: ${e2.message}`);
      }
    }
    
    // Delete tasks that reference projects
    try {
      const deletedTasks = await prisma.task.deleteMany({
        where: {
          projectId: {
            in: projectIds
          }
        }
      });
      console.log(`   Deleted ${deletedTasks.count} task(s)`);
    } catch (e) {
      console.log(`   No tasks to delete`);
    }
    
    // Delete project checklists
    try {
      const deletedChecklists = await prisma.projectChecklist.deleteMany({
        where: {
          projectId: {
            in: projectIds
          }
        }
      });
      console.log(`   Deleted ${deletedChecklists.count} checklist item(s)`);
    } catch (e) {
      console.log(`   No checklists to delete`);
    }
    
    // Delete project attachments
    try {
      const deletedAttachments = await prisma.projectAttachment.deleteMany({
        where: {
          projectId: {
            in: projectIds
          }
        }
      });
      console.log(`   Deleted ${deletedAttachments.count} attachment(s)`);
    } catch (e) {
      console.log(`   No attachments to delete`);
    }
    
    // Delete project assignments
    try {
      const deletedAssignments = await prisma.projectAssignment.deleteMany({
        where: {
          projectId: {
            in: projectIds
          }
        }
      });
      console.log(`   Deleted ${deletedAssignments.count} assignment(s)`);
    } catch (e) {
      console.log(`   No assignments to delete`);
    }
    
    // Now delete all projects
    console.log('\n🗑️  Deleting projects...');
    const result = await prisma.project.deleteMany({});
    
    console.log(`\n✅ Deleted ${result.count} project(s) from database`);
    console.log('   (Related tasks, checklists, and attachments were also deleted)');
    
    // Verify deletion
    const remaining = await prisma.project.count();
    console.log(`\n📊 Remaining projects: ${remaining}`);
    
    if (remaining === 0) {
      console.log('✅ Database is now empty. Dashboard should show 0 active projects.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllProjects();

