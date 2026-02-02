-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "dcciNo" TEXT,
ADD COLUMN     "dunsNumber" TEXT,
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "legalType" TEXT,
ADD COLUMN     "licenseCategory" TEXT,
ADD COLUMN     "mainLicenseNo" TEXT,
ADD COLUMN     "registerNo" TEXT,
ADD COLUMN     "trnNumber" TEXT;
