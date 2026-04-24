-- Visa file number (separate from residency UID in employee directory UI)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "visaNumber" TEXT;
