-- AlterTable
ALTER TABLE "item_status_logs" ADD COLUMN     "fromReturnId" TEXT;

-- AlterTable
ALTER TABLE "stock_adjustments" ADD COLUMN     "fromReturnId" TEXT;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_fromReturnId_fkey" FOREIGN KEY ("fromReturnId") REFERENCES "return_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_fromReturnId_fkey" FOREIGN KEY ("fromReturnId") REFERENCES "return_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
