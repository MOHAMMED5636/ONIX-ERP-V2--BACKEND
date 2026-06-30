-- AlterTable
ALTER TABLE "documents" ADD COLUMN "contentSha256" TEXT;

-- CreateIndex
CREATE INDEX "documents_module_entityCode_contentSha256_idx" ON "documents"("module", "entityCode", "contentSha256");
