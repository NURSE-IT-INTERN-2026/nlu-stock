-- AlterTable
ALTER TABLE "sub_items" ADD COLUMN     "receiveRecordId" TEXT;

-- AddForeignKey
ALTER TABLE "sub_items" ADD CONSTRAINT "sub_items_receiveRecordId_fkey" FOREIGN KEY ("receiveRecordId") REFERENCES "receive_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
