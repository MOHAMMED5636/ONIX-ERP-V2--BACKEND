// Safe script to delete all projects with proper cascade handling
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllProjects() {
  try {
    console.log('🗑️  Deleting all projects from database (with cascade)...\n');
    
    // Step 1: Delete tender invitations first (they reference tenders)
    console.log('Step 1: Deleting tender invitations...');
    const deletedInvitations = await prisma.tenderInvitation.deleteMany({});
    console.log(`   ✅ Deleted ${deletedInvitations.count} tender invitation(s)\n`);
    
    // Step 2: Delete tenders (they reference projects)
    console.log('Step 2: Deleting tenders...');
    const deletedTenders = await prisma.tender.deleteMany({});
    console.log(`   ✅ Deleted ${deletedTenders.count} tender(s)\n`);
    
    // Step 3: Delete tasks (they reference projects)
    console.log('Step 3: Deleting tasks...');
    const deletedTasks = await prisma.task.deleteMany({});
    console.log(`   ✅ Deleted ${deletedTasks.count} task(s)\n`);
    
    // Step 4: Delete project checklists
    console.log('Step 4: Deleting project checklists...');
    const deletedChecklists = await prisma.projectChecklist.deleteMany({});
    console.log(`   ✅ Deleted ${deletedChecklists.count} checklist item(s)\n`);
    
    // Step 5: Delete project attachments
    console.log('Step 5: Deleting project attachments...');
    const deletedAttachments = await prisma.projectAttachment.deleteMany({});
    console.log(`   ✅ Deleted ${deletedAttachments.count} attachment(s)\n`);
    
    // Step 6: Delete project assignments
    console.log('Step 6: Deleting project assignments...');
    const deletedAssignments = await prisma.projectAssignment.deleteMany({});
    console.log(`   ✅ Deleted ${deletedAssignments.count} assignment(s)\n`);
    
    // Step 7: Delete documents that reference projects
    console.log('Step 7: Deleting project documents...');
    const deletedDocs = await prisma.document.deleteMany({
      where: {
        projectId: {
          not: null
        }
      }
    });
    console.log(`   ✅ Deleted ${deletedDocs.count} document(s)\n`);
    
    // Step 8: Now delete all projects
    console.log('Step 8: Deleting projects...');
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        status: true
      }
    });
    
    console.log(`   Found ${projects.length} project(s) to delete:`);
    projects.forEach((p, i) => {
      console.log(`      ${i + 1}. ${p.name} (${p.referenceNumber}) - ${p.status}`);
    });
    
    const result = await prisma.project.deleteMany({});
    console.log(`\n   ✅ Deleted ${result.count} project(s)\n`);
    
    // Verify deletion
    const remaining = await prisma.project.count();
    console.log(`📊 Verification:`);
    console.log(`   Remaining projects: ${remaining}`);
    
    if (remaining === 0) {
      console.log('\n✅ SUCCESS! All projects deleted.');
      console.log('   Dashboard should now show "Active Projects = 0"');
    } else {
      console.log(`\n⚠️  Warning: ${remaining} project(s) still remain`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'P2003') {
      console.error('   Foreign key constraint violation. Some related records still exist.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllProjects();

