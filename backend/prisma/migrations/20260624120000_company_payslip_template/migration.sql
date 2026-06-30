-- Official payslip blank template (PNG/JPG) per company — HR uploads in ERP
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "payslipTemplate" TEXT;
