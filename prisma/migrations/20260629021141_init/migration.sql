-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "DispenseType" AS ENUM ('CONSUMABLE', 'COUNT', 'ITEM');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'CHECKED_OUT', 'DAMAGED', 'UNDER_REPAIR', 'LOST', 'PENDING_MAINTENANCE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'INSTRUCTOR', 'CHILDREN');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('LOST', 'DAMAGED_PENDING_REPAIR', 'COUNT_MISMATCH_SHORT', 'COUNT_MISMATCH_OVER', 'DISPOSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "MaintenanceResult" AS ENUM ('AVAILABLE', 'NEEDS_MORE_REPAIR', 'DISPOSED');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'OLD', 'USABLE', 'FAIR', 'UNUSABLE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('COURSE', 'ACTIVITY', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "dispenseType" "DispenseType" NOT NULL,
    "assetTracking" BOOLEAN NOT NULL DEFAULT false,
    "setTracking" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT NOT NULL DEFAULT 'Package',
    "color" TEXT NOT NULL DEFAULT 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "category_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "categoryId" TEXT NOT NULL,
    "trackIndividually" BOOLEAN NOT NULL DEFAULT false,
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "issueUnitId" TEXT NOT NULL,
    "minThreshold" INTEGER NOT NULL DEFAULT 0,
    "locationId" TEXT,
    "imageUrl" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "availableQty" INTEGER NOT NULL DEFAULT 0,
    "storageRequirements" TEXT,
    "setSize" INTEGER NOT NULL DEFAULT 1,
    "borrowable" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DOUBLE PRECISION,
    "vendorCompany" TEXT,
    "vendorContact" TEXT,
    "vendorPhone" TEXT,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "maintenanceCycleMonths" INTEGER NOT NULL DEFAULT 12,
    "lastMaintenanceDate" TIMESTAMP(3),
    "nextMaintenanceDate" TIMESTAMP(3),
    "manualUrl" TEXT,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_items" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subCode" TEXT NOT NULL,
    "name" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" "ItemCondition",
    "serialNumber" TEXT,
    "notes" TEXT,
    "imageUrl" TEXT,
    "images" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "remainingQty" INTEGER NOT NULL DEFAULT 0,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispense_records" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subItemId" TEXT,
    "lotId" TEXT,
    "quantity" INTEGER NOT NULL,
    "usageType" "UsageType",
    "usageNote" TEXT,
    "staffId" TEXT NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "dispense_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receive_records" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" INTEGER NOT NULL,
    "receivedBy" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "receive_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT,
    "delta" INTEGER NOT NULL DEFAULT 0,
    "previousQty" INTEGER NOT NULL,
    "newQty" INTEGER NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "notes" TEXT,
    "adjustedBy" TEXT NOT NULL,
    "imageEvidence" TEXT,
    "adjustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subItemId" TEXT,
    "type" "MaintenanceType" NOT NULL,
    "result" "MaintenanceResult" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "performedBy" TEXT NOT NULL,
    "issue" TEXT,
    "description" TEXT,
    "cost" DOUBLE PRECISION,
    "attachmentUrls" TEXT[],
    "nextMaintenanceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_status_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subItemId" TEXT,
    "previousStatus" "ItemStatus" NOT NULL,
    "newStatus" "ItemStatus" NOT NULL,
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "imageUrl" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "category_profiles_name_key" ON "category_profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "category_profiles_code_key" ON "category_profiles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_building_floor_room_detail_key" ON "locations"("building", "floor", "room", "detail");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE INDEX "items_categoryId_isActive_idx" ON "items"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "items_locationId_idx" ON "items"("locationId");

-- CreateIndex
CREATE INDEX "items_availableQty_idx" ON "items"("availableQty");

-- CreateIndex
CREATE INDEX "sub_items_itemId_status_idx" ON "sub_items"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_items_itemId_subCode_key" ON "sub_items"("itemId", "subCode");

-- CreateIndex
CREATE INDEX "lots_itemId_expiryDate_idx" ON "lots"("itemId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "lots_itemId_lotNumber_key" ON "lots"("itemId", "lotNumber");

-- CreateIndex
CREATE INDEX "dispense_records_itemId_dispensedAt_idx" ON "dispense_records"("itemId", "dispensedAt");

-- CreateIndex
CREATE INDEX "dispense_records_staffId_dispensedAt_idx" ON "dispense_records"("staffId", "dispensedAt");

-- CreateIndex
CREATE INDEX "dispense_records_usageType_dispensedAt_idx" ON "dispense_records"("usageType", "dispensedAt");

-- CreateIndex
CREATE INDEX "receive_records_itemId_receivedAt_idx" ON "receive_records"("itemId", "receivedAt");

-- CreateIndex
CREATE INDEX "stock_adjustments_itemId_adjustedAt_idx" ON "stock_adjustments"("itemId", "adjustedAt");

-- CreateIndex
CREATE INDEX "maintenance_records_subItemId_idx" ON "maintenance_records"("subItemId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "category_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_issueUnitId_fkey" FOREIGN KEY ("issueUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_items" ADD CONSTRAINT "sub_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_subItemId_fkey" FOREIGN KEY ("subItemId") REFERENCES "sub_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_records" ADD CONSTRAINT "receive_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_records" ADD CONSTRAINT "receive_records_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_records" ADD CONSTRAINT "receive_records_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_adjustedBy_fkey" FOREIGN KEY ("adjustedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_subItemId_fkey" FOREIGN KEY ("subItemId") REFERENCES "sub_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_subItemId_fkey" FOREIGN KEY ("subItemId") REFERENCES "sub_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
