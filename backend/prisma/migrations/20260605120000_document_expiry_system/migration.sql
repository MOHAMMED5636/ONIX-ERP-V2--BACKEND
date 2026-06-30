-- Company attachment per-file expiry
ALTER TABLE "company_attachments" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Notification deduplication for document expiry reminders
CREATE TABLE IF NOT EXISTS "document_expiry_notification_logs" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_expiry_notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_expiry_notification_logs_recipientUserId_sourceKey_thresholdDays_key"
ON "document_expiry_notification_logs"("recipientUserId", "sourceKey", "thresholdDays");

CREATE INDEX IF NOT EXISTS "document_expiry_notification_logs_recipientUserId_idx"
ON "document_expiry_notification_logs"("recipientUserId");

CREATE INDEX IF NOT EXISTS "document_expiry_notification_logs_sourceKey_idx"
ON "document_expiry_notification_logs"("sourceKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_expiry_notification_logs_recipientUserId_fkey'
  ) THEN
    ALTER TABLE "document_expiry_notification_logs"
    ADD CONSTRAINT "document_expiry_notification_logs_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
