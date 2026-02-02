import prisma from '../src/config/database';

/**
 * Script to delete all clients from the database
 * This will:
 * 1. Set clientId to null in all projects and tenders
 * 2. Delete all client document attachments
 * 3. Delete all clients
 */

async function deleteAllClients() {
  try {
    console.log('🔄 Starting to delete all clients...');

    // Get all clients first to handle document attachments
    const allClients = await prisma.client.findMany({
      select: {
        id: true,
        referenceNumber: true,
        documentAttachment: true,
      },
    });

    console.log(`📋 Found ${allClients.length} client(s) to delete`);

    // Delete document files if they exist
    const fs = require('fs');
    const path = require('path');
    let deletedFiles = 0;

    for (const client of allClients) {
      if (client.documentAttachment) {
        const filePath = path.join(process.cwd(), client.documentAttachment);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedFiles++;
            console.log(`📄 Deleted document: ${client.documentAttachment}`);
          }
        } catch (fileError) {
          console.error(`⚠️ Error deleting document file for ${client.referenceNumber}:`, fileError);
        }
      }
    }

    console.log(`📄 Deleted ${deletedFiles} document file(s)`);

    // First, set clientId to null in all projects and tenders
    console.log('🔄 Removing client references from projects and tenders...');
    
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

    console.log(`✅ Updated ${updatedProjects.count} project(s)`);
    console.log(`✅ Updated ${updatedTenders.count} tender(s)`);

    // Delete all clients
    console.log('🔄 Deleting all clients...');
    const deleteResult = await prisma.client.deleteMany({});

    console.log(`✅ Successfully deleted ${deleteResult.count} client(s)`);
    console.log('✨ All clients cleared successfully!');
  } catch (error: any) {
    console.error('❌ Error deleting all clients:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
deleteAllClients()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
