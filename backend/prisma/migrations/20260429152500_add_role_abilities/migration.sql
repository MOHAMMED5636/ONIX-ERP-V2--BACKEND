-- Create role_abilities table for DB-driven permissions
CREATE TABLE IF NOT EXISTS "public"."role_abilities" (
  "id" TEXT NOT NULL,
  "role" "public"."UserRole" NOT NULL,
  "ability" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_abilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_abilities_role_ability_key"
  ON "public"."role_abilities"("role", "ability");

CREATE INDEX IF NOT EXISTS "role_abilities_role_idx"
  ON "public"."role_abilities"("role");

