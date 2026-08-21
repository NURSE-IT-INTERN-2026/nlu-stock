-- AlterTable
ALTER TABLE "maintenance_records" ADD COLUMN     "repairBookingId" TEXT;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_repairBookingId_fkey" FOREIGN KEY ("repairBookingId") REFERENCES "stock_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
