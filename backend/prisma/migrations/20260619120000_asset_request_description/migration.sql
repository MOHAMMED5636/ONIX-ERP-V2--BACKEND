-- Asset request: optional detailed description + support for "Other" category specification via assetType
ALTER TABLE "asset_requests" ADD COLUMN IF NOT EXISTS "assetDescription" TEXT;
