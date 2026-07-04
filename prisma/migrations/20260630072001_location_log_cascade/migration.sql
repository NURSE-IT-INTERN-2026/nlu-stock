-- DropForeignKey
ALTER TABLE "location_change_logs" DROP CONSTRAINT "location_change_logs_itemId_fkey";

-- AddForeignKey
ALTER TABLE "location_change_logs" ADD CONSTRAINT "location_change_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
