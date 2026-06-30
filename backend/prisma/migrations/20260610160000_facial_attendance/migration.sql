-- Facial attendance: mobile selfie verification at check-in/out
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "requireFacialAttendance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "facialMatchMinScore" DOUBLE PRECISION NOT NULL DEFAULT 0.55;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faceDescriptor" JSONB;

ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "facePhotoPath" TEXT;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "faceMatchScore" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "faceVerified" BOOLEAN NOT NULL DEFAULT false;
