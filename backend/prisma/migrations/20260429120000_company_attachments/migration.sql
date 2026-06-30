-- CreateEnum
CREATE TYPE "CompanyAttachmentCategory" AS ENUM (
  'TRADE_LICENSE',
  'EJARI',
  'MEMORANDUM_OF_ASSOCIATION',
  'ESTABLISHMENT_CARD',
  'BANK_DETAILS',
  'TAX_REGISTRATION',
  'INSURANCE',
  'COMPANY_IDENTITY',
  'ISO_CERTIFICATE',
  'OTHER_CERTIFICATION'
);

-- CreateTable
CREATE TABLE "company_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "CompanyAttachmentCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "label" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_attachments_companyId_idx" ON "company_attachments"("companyId");

-- CreateIndex
CREATE INDEX "company_attachments_companyId_category_idx" ON "company_attachments"("companyId", "category");

-- AddForeignKey
ALTER TABLE "company_attachments" ADD CONSTRAINT "company_attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_attachments" ADD CONSTRAINT "company_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
