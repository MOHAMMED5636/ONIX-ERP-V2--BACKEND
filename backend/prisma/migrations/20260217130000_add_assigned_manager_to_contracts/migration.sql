-- AlterTable
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "assignedManagerId" TEXT;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contracts_assignedManagerId_fkey'
    ) THEN
        ALTER TABLE "contracts" ADD CONSTRAINT "contracts_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
