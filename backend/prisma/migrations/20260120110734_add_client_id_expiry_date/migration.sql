-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "documentAttachment" TEXT,
ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "idExpiryDate" TIMESTAMP(3);
