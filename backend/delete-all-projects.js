const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllProjects() {
  try {
    console.log('🗑️  Starting deletion of all projects...');
    
    // First, get count of projects
    const projectCount = await prisma.project.count();
    console.log(`📊 Found ${projectCount} projects to delete`);
    
    if (projectCount === 0) {
      console.log('✅ No projects to delete. Database is already empty.');
      return;
    }
    
    // Get all project IDs
    const projects = await prisma.project.findMany({
      select: { id: true, name: true, referenceNumber: true }
    });
    
    console.log('\n📋 Projects to be deleted:');
    projects.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.referenceNumber} - ${p.name}`);
    });
    
    // Delete all projects using cascade delete
    // The schema has onDelete: Cascade for related records
    let deletedCount = 0;
    
    for (const project of projects) {
      try {
        // Use transaction to ensure cascade deletes work properly
        await prisma.$transaction(async (tx) => {
          // Delete tender invitations
          const tenders = await tx.tender.findMany({
            where: { projectId: project.id },
            select: { id: true }
          });
          const tenderIds = tenders.map(t => t.id);
          
          if (tenderIds.length > 0) {
            await tx.tenderInvitation.deleteMany({
              where: { tenderId: { in: tenderIds } }
            });
            await tx.technicalSubmission.deleteMany({
              where: { tenderId: { in: tenderIds } }
            });
            await tx.tender.deleteMany({
              where: { projectId: project.id }
            });
          }
          
          // Delete project assignments
          await tx.projectAssignment.deleteMany({
            where: { projectId: project.id }
          });
          
          // Delete tasks
          await tx.task.deleteMany({
            where: { projectId: project.id }
          });
          
          // Delete documents
          await tx.document.deleteMany({
            where: { projectId: project.id }
          });
          
          // Finally delete the project
          await tx.project.delete({
            where: { id: project.id }
          });
        });
        
        deletedCount++;
        console.log(`✅ Deleted: ${project.referenceNumber} - ${project.name}`);
      } catch (error) {
        console.error(`❌ Error deleting project ${project.referenceNumber}:`, error.message);
      }
    }
    
    // Verify deletion
    const remainingCount = await prisma.project.count();
    console.log(`\n📊 Deletion complete!`);
    console.log(`   Deleted: ${deletedCount} projects`);
    console.log(`   Remaining: ${remainingCount} projects`);
    
    if (remainingCount === 0) {
      console.log('✅ All projects deleted successfully! Dashboard will now show 0 active projects.');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} projects still remain.`);
    }
    
  } catch (error) {
    console.error('❌ Error deleting projects:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteAllProjects()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
