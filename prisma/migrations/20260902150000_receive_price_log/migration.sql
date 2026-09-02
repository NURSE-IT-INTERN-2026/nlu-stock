-- ราคาต่อหน่วยของใบรับเข้าแก้ย้อนหลังได้ และเป็นตัวตั้งของ Item.purchasePrice, Lot.unitCost
-- และมูลค่าคงคลังทั้งรายงาน — แก้ทีเดียวตัวเลขขยับทั้งกระดานโดยไม่เหลือร่องรอย
CREATE TABLE "receive_price_logs" (
    "id" TEXT NOT NULL,
    "receiveId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT,
    "lotNumber" TEXT,
    "fromCost" DOUBLE PRECISION,
    "toCost" DOUBLE PRECISION,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receive_price_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "receive_price_logs_itemId_changedAt_idx" ON "receive_price_logs"("itemId", "changedAt");

ALTER TABLE "receive_price_logs" ADD CONSTRAINT "receive_price_logs_receiveId_fkey" FOREIGN KEY ("receiveId") REFERENCES "receive_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receive_price_logs" ADD CONSTRAINT "receive_price_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receive_price_logs" ADD CONSTRAINT "receive_price_logs_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receive_price_logs" ADD CONSTRAINT "receive_price_logs_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
