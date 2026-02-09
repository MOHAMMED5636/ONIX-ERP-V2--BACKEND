import prisma from '../src/config/database';

/**
 * Script to delete all contracts from the database.
 * Run from backend folder: npx ts-node scripts/delete-all-contracts.ts
 */

async function deleteAllContracts() {
  try {
    console.log('🔄 Deleting all contracts...');

    const count = await prisma.contract.count();
    console.log(`📋 Found ${count} contract(s) to delete`);

    if (count === 0) {
      console.log('✨ Contract list is already empty.');
      return;
    }

    const result = await prisma.contract.deleteMany({});

    console.log(`✅ Deleted ${result.count} contract(s)`);
    console.log('✨ Contract list is now empty.');
  } catch (error: any) {
    console.error('❌ Error deleting contracts:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllContracts()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
