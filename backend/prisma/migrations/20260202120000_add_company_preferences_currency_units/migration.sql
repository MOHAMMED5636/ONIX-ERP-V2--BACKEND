-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultCurrency" TEXT DEFAULT 'AED',
ADD COLUMN     "lengthUnit" TEXT DEFAULT 'meter',
ADD COLUMN     "areaUnit" TEXT DEFAULT 'sqm',
ADD COLUMN     "volumeUnit" TEXT DEFAULT 'm3',
ADD COLUMN     "heightUnit" TEXT DEFAULT 'meter',
ADD COLUMN     "weightUnit" TEXT DEFAULT 'kg';
