-- AlterTable: Item field changes
-- Rename nameTh to nameEn
ALTER TABLE "items" RENAME COLUMN "nameTh" TO "nameEn";

-- Remove old vendor field
ALTER TABLE "items" DROP COLUMN "vendor";

-- Add new vendor fields
ALTER TABLE "items" ADD COLUMN "vendorCompany" TEXT;
ALTER TABLE "items" ADD COLUMN "vendorContact" TEXT;
ALTER TABLE "items" ADD COLUMN "vendorPhone" TEXT;

-- Replace warrantyEndDate with warrantyMonths
ALTER TABLE "items" DROP COLUMN "warrantyEndDate";
ALTER TABLE "items" ADD COLUMN "warrantyMonths" INTEGER NOT NULL DEFAULT 0;

-- Remove serialNumber from items (moved to sub_items)
ALTER TABLE "items" DROP COLUMN "serialNumber";

-- Add storageRequirements for consumables
ALTER TABLE "items" ADD COLUMN "storageRequirements" TEXT;

-- AlterTable: SubItem - add serialNumber
ALTER TABLE "sub_items" ADD COLUMN "serialNumber" TEXT;
