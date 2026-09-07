-- AlterTable
ALTER TABLE "maintenance_records" ADD COLUMN     "sentLogId" TEXT;

-- CreateIndex
CREATE INDEX "maintenance_records_sentLogId_idx" ON "maintenance_records"("sentLogId");

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_sentLogId_fkey" FOREIGN KEY ("sentLogId") REFERENCES "item_status_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
