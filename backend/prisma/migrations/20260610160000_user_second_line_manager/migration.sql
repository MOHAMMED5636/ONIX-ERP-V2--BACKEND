-- AlterTable
ALTER TABLE "users" ADD COLUMN "secondLineManagerId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_secondLineManagerId_fkey" FOREIGN KEY ("secondLineManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
