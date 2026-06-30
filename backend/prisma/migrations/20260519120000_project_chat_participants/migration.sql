-- CreateTable
CREATE TABLE "project_chat_participants" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_chat_participants_projectId_userId_key" ON "project_chat_participants"("projectId", "userId");

-- CreateIndex
CREATE INDEX "project_chat_participants_userId_idx" ON "project_chat_participants"("userId");

-- AddForeignKey
ALTER TABLE "project_chat_participants" ADD CONSTRAINT "project_chat_participants_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_chat_participants" ADD CONSTRAINT "project_chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_chat_participants" ADD CONSTRAINT "project_chat_participants_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
