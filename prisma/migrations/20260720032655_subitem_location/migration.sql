-- AlterTable
ALTER TABLE "sub_items" ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "sub_items" ADD CONSTRAINT "sub_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
