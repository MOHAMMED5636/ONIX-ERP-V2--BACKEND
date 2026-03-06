-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "assignedManagerId" TEXT,
ADD COLUMN     "assignedManagerEmail" TEXT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
