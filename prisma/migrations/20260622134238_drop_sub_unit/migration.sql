-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_subUnitId_fkey";

-- AlterTable
ALTER TABLE "dispense_records" DROP COLUMN "quantitySub";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "conversionFactor",
DROP COLUMN "subUnitId";
