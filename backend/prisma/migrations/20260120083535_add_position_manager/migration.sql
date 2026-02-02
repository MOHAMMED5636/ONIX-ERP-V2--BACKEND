-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "managerId" TEXT;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
