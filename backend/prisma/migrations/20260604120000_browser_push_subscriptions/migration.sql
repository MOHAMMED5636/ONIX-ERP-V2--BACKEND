-- CreateTable
CREATE TABLE "browser_push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "browser_push_subscriptions_endpoint_key" ON "browser_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "browser_push_subscriptions_userId_idx" ON "browser_push_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "browser_push_subscriptions" ADD CONSTRAINT "browser_push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
