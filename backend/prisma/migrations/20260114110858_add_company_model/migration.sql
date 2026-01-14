-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "address" TEXT,
    "industry" TEXT,
    "founded" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactExtension" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "licenseStatus" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "logo" TEXT,
    "header" TEXT,
    "footer" TEXT,
    "employees" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
