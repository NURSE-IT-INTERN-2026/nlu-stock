-- ชื่อ/รหัส/หมวดหมู่/หน่วยนับ/ราคาซื้อ/การปลดออกจากทะเบียน แก้แล้วเขียนความหมายของประวัติเก่า
-- ทับย้อนหลัง แต่ไม่เคยเหลือร่องรอยว่าเคยเป็นอะไรหรือใครแก้
CREATE TABLE "item_field_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_field_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "item_field_logs_itemId_changedAt_idx" ON "item_field_logs"("itemId", "changedAt");

ALTER TABLE "item_field_logs" ADD CONSTRAINT "item_field_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_field_logs" ADD CONSTRAINT "item_field_logs_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
