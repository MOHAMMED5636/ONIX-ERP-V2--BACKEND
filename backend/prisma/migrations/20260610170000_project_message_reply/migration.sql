-- WhatsApp-style reply: link a message to the message it replies to
ALTER TABLE "project_messages" ADD COLUMN "replyToMessageId" TEXT;

ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId") REFERENCES "project_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "project_messages_replyToMessageId_idx" ON "project_messages"("replyToMessageId");
