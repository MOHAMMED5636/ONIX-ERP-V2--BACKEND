const { PrismaClient } = require('@prisma/client');

const STEPS = [
  `CREATE TABLE IF NOT EXISTS "browser_push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "browser_push_subscriptions_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "browser_push_subscriptions_endpoint_key"
    ON "browser_push_subscriptions"("endpoint")`,
  `CREATE INDEX IF NOT EXISTS "browser_push_subscriptions_userId_idx"
    ON "browser_push_subscriptions"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "browser_push_subscriptions"
      ADD CONSTRAINT "browser_push_subscriptions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const sql of STEPS) {
      await prisma.$executeRawUnsafe(sql);
    }
    const tbl = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'browser_push_subscriptions'
    `;
    console.log('browser_push_subscriptions ready:', tbl);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
