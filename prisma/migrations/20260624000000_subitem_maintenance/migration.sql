-- AlterTable
ALTER TABLE "maintenance_records" ADD COLUMN "subItemId" TEXT;

-- CreateIndex
CREATE INDEX "maintenance_records_subItemId_idx" ON "maintenance_records"("subItemId");

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_subItemId_fkey" FOREIGN KEY ("subItemId") REFERENCES "sub_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
