-- Official company seal/stamp image for payslips and HR documents
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stamp" TEXT;
