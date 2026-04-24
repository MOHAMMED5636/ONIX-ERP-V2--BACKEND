-- CreateTable
CREATE TABLE "company_policies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'General',
    "fileName" TEXT,
    "fileType" TEXT NOT NULL DEFAULT 'PDF',
    "fileSize" TEXT NOT NULL DEFAULT '—',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_policy_acknowledgements" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_policy_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_policy_acknowledgements_userId_idx" ON "company_policy_acknowledgements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "company_policy_acknowledgements_policyId_userId_key" ON "company_policy_acknowledgements"("policyId", "userId");

-- AddForeignKey
ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_policy_acknowledgements" ADD CONSTRAINT "company_policy_acknowledgements_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "company_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_policy_acknowledgements" ADD CONSTRAINT "company_policy_acknowledgements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
