-- AlterTable
ALTER TABLE "dispense_records" ADD COLUMN     "recoveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "item_status_logs" ADD COLUMN     "recoveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_adjustments" ADD COLUMN     "recoveredAt" TIMESTAMP(3);
