-- Create per-year counter table for Client.referenceNumber (O-CL-YYYY/NNNN)
CREATE TABLE IF NOT EXISTS "client_reference_sequences" (
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_reference_sequences_pkey" PRIMARY KEY ("year")
);

