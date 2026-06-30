CREATE TABLE "project_deletion_otp_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" VARCHAR(255) NOT NULL,
    "projectRef" VARCHAR(64),
    "requestedById" TEXT NOT NULL,
    "otpHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_deletion_otp_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_deletion_otp_requests_projectId_requestedById_status_idx" ON "project_deletion_otp_requests"("projectId", "requestedById", "status");

ALTER TABLE "project_deletion_otp_requests" ADD CONSTRAINT "project_deletion_otp_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_deletion_otp_requests" ADD CONSTRAINT "project_deletion_otp_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
