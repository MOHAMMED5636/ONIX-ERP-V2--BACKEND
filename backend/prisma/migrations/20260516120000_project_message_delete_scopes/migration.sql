-- Delete for me / delete for everyone on project chat messages
ALTER TABLE "project_messages" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "project_messages" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "project_messages" DROP CONSTRAINT IF EXISTS "project_messages_deletedById_fkey";
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "project_message_hides" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_message_hides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_message_hides_messageId_userId_key"
  ON "project_message_hides"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "project_message_hides_userId_idx" ON "project_message_hides"("userId");

ALTER TABLE "project_message_hides" DROP CONSTRAINT IF EXISTS "project_message_hides_messageId_fkey";
ALTER TABLE "project_message_hides" ADD CONSTRAINT "project_message_hides_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "project_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_message_hides" DROP CONSTRAINT IF EXISTS "project_message_hides_userId_fkey";
ALTER TABLE "project_message_hides" ADD CONSTRAINT "project_message_hides_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
