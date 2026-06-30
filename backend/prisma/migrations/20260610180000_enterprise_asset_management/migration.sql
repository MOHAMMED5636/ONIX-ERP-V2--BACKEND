-- Enterprise Asset Management (EAM)

CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'DISPOSED');
CREATE TYPE "AssetLocationType" AS ENUM ('WAREHOUSE', 'OFFICE_ROOM', 'REMOTE', 'IT_REPAIR_LAB');
CREATE TYPE "MaintenanceIssueType" AS ENUM ('HARDWARE_FAILURE', 'SOFTWARE_ISSUE', 'ROUTINE_MAINTENANCE');
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('OPEN', 'ASSIGNED_TO_TECH', 'IN_REPAIR', 'RESOLVED', 'CLOSED');
CREATE TYPE "AssetLogAction" AS ENUM ('PROVISIONED', 'ASSIGNED', 'TRANSFERRED', 'RETURNED_TO_STOCK', 'SENT_TO_REPAIR', 'REPAIR_COMPLETED', 'SCRAPPED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('PENDING_SERIALS', 'COMPLETE');
CREATE TYPE "PurchaseRequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED');

CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minThreshold" INTEGER NOT NULL DEFAULT 0,
    "depreciationLifespanYears" DECIMAL(5,2) NOT NULL,
    "salvageValuePercentage" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset_categories"("name");

CREATE TABLE "asset_tag_sequences" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "asset_tag_sequences_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "vendorName" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_order_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

CREATE TABLE "goods_receipt_notes" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'PENDING_SERIALS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipt_notes_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "goods_receipt_notes_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "goods_receipt_notes_grnNumber_key" ON "goods_receipt_notes"("grnNumber");
CREATE INDEX "goods_receipt_notes_purchaseOrderLineId_idx" ON "goods_receipt_notes"("purchaseOrderLineId");

CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "purchaseCost" DECIMAL(12,2) NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assignedToId" TEXT,
    "locationType" "AssetLocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "locationId" TEXT,
    "isQrPrinted" BOOLEAN NOT NULL DEFAULT false,
    "disposedAt" TIMESTAMP(3),
    "grnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assets_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_receipt_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "assets_assetTag_key" ON "assets"("assetTag");
CREATE UNIQUE INDEX "assets_qrToken_key" ON "assets"("qrToken");
CREATE UNIQUE INDEX "assets_serialNumber_key" ON "assets"("serialNumber");
CREATE INDEX "assets_status_idx" ON "assets"("status");
CREATE INDEX "assets_categoryId_idx" ON "assets"("categoryId");
CREATE INDEX "assets_assignedToId_idx" ON "assets"("assignedToId");
CREATE INDEX "assets_isQrPrinted_idx" ON "assets"("isQrPrinted");
CREATE INDEX "assets_qrToken_idx" ON "assets"("qrToken");

CREATE TABLE "asset_logs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "action" "AssetLogAction" NOT NULL,
    "performedById" TEXT,
    "oldCustodianId" TEXT,
    "newCustodianId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asset_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "asset_logs_assetId_createdAt_idx" ON "asset_logs"("assetId", "createdAt");

CREATE TABLE "maintenance_tickets" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "technicianId" TEXT,
    "issueType" "MaintenanceIssueType" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'OPEN',
    "repairCost" DECIMAL(12,2),
    "notes" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_tickets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "maintenance_tickets_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "maintenance_tickets_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "maintenance_tickets_assetId_idx" ON "maintenance_tickets"("assetId");
CREATE INDEX "maintenance_tickets_reporterId_idx" ON "maintenance_tickets"("reporterId");
CREATE INDEX "maintenance_tickets_technicianId_idx" ON "maintenance_tickets"("technicianId");
CREATE INDEX "maintenance_tickets_status_idx" ON "maintenance_tickets"("status");

CREATE TABLE "purchase_requisitions" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "suggestedQuantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PurchaseRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_requisitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_requisitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "purchase_requisitions_categoryId_idx" ON "purchase_requisitions"("categoryId");
CREATE INDEX "purchase_requisitions_status_idx" ON "purchase_requisitions"("status");
