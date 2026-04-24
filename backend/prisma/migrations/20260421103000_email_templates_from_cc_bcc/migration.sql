-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN "fromEmail" TEXT;
ALTER TABLE "email_templates" ADD COLUMN "cc" TEXT;
ALTER TABLE "email_templates" ADD COLUMN "bcc" TEXT;

