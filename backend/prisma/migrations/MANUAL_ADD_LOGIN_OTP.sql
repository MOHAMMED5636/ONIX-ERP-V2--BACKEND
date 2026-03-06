-- Migration: Add loginOtp and loginOtpExpiry fields to User table
-- Run this SQL manually if migrations are having issues

ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "loginOtp" TEXT,
ADD COLUMN IF NOT EXISTS "loginOtpExpiry" TIMESTAMP(3);

-- Create index for faster OTP lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS "users_loginOtp_idx" ON "users"("loginOtp");
