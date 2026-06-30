-- Read receipts for project chat messages (WhatsApp-style "seen")
CREATE TABLE "project_message_reads" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_message_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_message_reads_messageId_userId_key" ON "project_message_reads"("messageId", "userId");
CREATE INDEX "project_message_reads_userId_idx" ON "project_message_reads"("userId");

ALTER TABLE "project_message_reads" ADD CONSTRAINT "project_message_reads_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "project_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_message_reads" ADD CONSTRAINT "project_message_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Speeds up unread-count and chat history queries
CREATE INDEX IF NOT EXISTS "project_messages_chatId_createdAt_idx" ON "project_messages"("chatId", "createdAt");
