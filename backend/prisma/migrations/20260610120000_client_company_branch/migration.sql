-- AlterTable
ALTER TABLE "clients" ADD COLUMN "companyId" TEXT;

-- CreateIndex
CREATE INDEX "clients_companyId_idx" ON "clients"("companyId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
