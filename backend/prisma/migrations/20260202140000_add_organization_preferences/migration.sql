-- CreateTable
CREATE TABLE "organization_preferences" (
    "id" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'AED',
    "lengthUnit" TEXT NOT NULL DEFAULT 'meter',
    "areaUnit" TEXT NOT NULL DEFAULT 'sqm',
    "volumeUnit" TEXT NOT NULL DEFAULT 'm3',
    "heightUnit" TEXT NOT NULL DEFAULT 'meter',
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "organization_preferences_pkey" PRIMARY KEY ("id")
);

-- Insert default row (singleton). Data migration script will copy from companies if needed.
INSERT INTO "organization_preferences" ("id", "defaultCurrency", "lengthUnit", "areaUnit", "volumeUnit", "heightUnit", "weightUnit", "updatedAt")
VALUES (gen_random_uuid(), 'AED', 'meter', 'sqm', 'm3', 'meter', 'kg', NOW());
