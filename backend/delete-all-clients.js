const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function deleteAllClients() {
  try {
    console.log('🗑️  Starting deletion of all clients...');
    
    // First, get count of clients
    const clientCount = await prisma.client.count();
    console.log(`📊 Found ${clientCount} clients to delete`);
    
    if (clientCount === 0) {
      console.log('✅ No clients to delete. Database is already empty.');
      return;
    }
    
    // Get all client IDs (without documentAttachment field in case migration not applied)
    const clients = await prisma.client.findMany({
      select: { 
        id: true, 
        name: true, 
        referenceNumber: true
      }
    });
    
    console.log('\n📋 Clients to be deleted:');
    clients.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.referenceNumber} - ${c.name}`);
    });
    
    // Try to delete document files if documentAttachment field exists
    let deletedFiles = 0;
    try {
      const clientsWithDocs = await prisma.client.findMany({
        select: { 
          id: true,
          referenceNumber: true,
          documentAttachment: true
        }
      });
      
      for (const client of clientsWithDocs) {
        if (client.documentAttachment) {
          try {
            const filePath = path.join(process.cwd(), client.documentAttachment);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedFiles++;
              console.log(`   📄 Deleted document: ${client.documentAttachment}`);
            }
          } catch (fileError) {
            console.error(`   ⚠️  Error deleting document for ${client.referenceNumber}:`, fileError.message);
          }
        }
      }
      
      if (deletedFiles > 0) {
        console.log(`\n📄 Deleted ${deletedFiles} document file(s)`);
      }
    } catch (error) {
      // Field doesn't exist yet, skip document deletion
      console.log('   ℹ️  Skipping document deletion (field not in database yet)');
    }
    
    // Check for clients with associated projects or tenders
    const clientsWithRelations = await prisma.client.findMany({
      where: {
        OR: [
          { projects: { some: {} } },
          { tenders: { some: {} } }
        ]
      },
      select: {
        id: true,
        referenceNumber: true,
        name: true,
        _count: {
          select: {
            projects: true,
            tenders: true
          }
        }
      }
    });
    
    if (clientsWithRelations.length > 0) {
      console.log('\n⚠️  WARNING: Some clients have associated projects or tenders:');
      clientsWithRelations.forEach(client => {
        console.log(`   ${client.referenceNumber} - ${client.name}: ${client._count.projects} projects, ${client._count.tenders} tenders`);
      });
      console.log('\n🔄 Removing client references from projects and tenders...');
      
      // Set clientId to null in all projects and tenders
      const [updatedProjects, updatedTenders] = await Promise.all([
        prisma.project.updateMany({
          where: {
            clientId: {
              not: null,
            },
          },
          data: {
            clientId: null,
          },
        }),
        prisma.tender.updateMany({
          where: {
            clientId: {
              not: null,
            },
          },
          data: {
            clientId: null,
          },
        }),
      ]);
      
      console.log(`✅ Updated ${updatedProjects.count} project(s) - client references removed`);
      console.log(`✅ Updated ${updatedTenders.count} tender(s) - client references removed`);
    }
    
    // Delete all clients using raw SQL to avoid schema mismatch issues
    let deletedCount = 0;
    
    try {
      // Use raw SQL to delete all clients (bypasses Prisma schema validation)
      const result = await prisma.$executeRawUnsafe('DELETE FROM clients');
      deletedCount = result;
      console.log(`✅ Deleted ${deletedCount} client(s) using raw SQL`);
    } catch (error) {
      console.error('❌ Error deleting clients:', error.message);
      // Fallback: try individual deletions
      console.log('   Trying individual deletions...');
      for (const client of clients) {
        try {
          await prisma.$executeRawUnsafe(`DELETE FROM clients WHERE id = $1`, client.id);
          deletedCount++;
          console.log(`✅ Deleted: ${client.referenceNumber} - ${client.name}`);
        } catch (err) {
          console.error(`❌ Error deleting client ${client.referenceNumber}:`, err.message);
        }
      }
    }
    
    // Verify deletion
    const remainingCount = await prisma.client.count();
    console.log(`\n📊 Deletion complete!`);
    console.log(`   Deleted: ${deletedCount} clients`);
    console.log(`   Remaining: ${remainingCount} clients`);
    
    if (remainingCount === 0) {
      console.log('✅ All clients deleted successfully!');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} clients still remain.`);
    }
    
  } catch (error) {
    console.error('❌ Error deleting clients:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteAllClients()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
