-- CreateEnum
CREATE TYPE "TeamChatRoomType" AS ENUM ('GENERAL', 'DM');

-- CreateTable
CREATE TABLE "team_chat_rooms" (
    "id" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "type" "TeamChatRoomType" NOT NULL DEFAULT 'DM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_chat_rooms_roomKey_key" ON "team_chat_rooms"("roomKey");

-- CreateTable
CREATE TABLE "team_chat_participants" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_chat_participants_roomId_userId_key" ON "team_chat_participants"("roomId", "userId");

-- CreateIndex
CREATE INDEX "team_chat_participants_userId_idx" ON "team_chat_participants"("userId");

-- AddForeignKey
ALTER TABLE "team_chat_participants" ADD CONSTRAINT "team_chat_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "team_chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_chat_participants" ADD CONSTRAINT "team_chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "team_chat_messages" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_chat_messages_roomId_createdAt_idx" ON "team_chat_messages"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "team_chat_messages" ADD CONSTRAINT "team_chat_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "team_chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_chat_messages" ADD CONSTRAINT "team_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

