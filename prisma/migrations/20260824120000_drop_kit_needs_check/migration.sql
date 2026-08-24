-- ตัด "รอตรวจ" ของชุด KIT ออกทั้งเส้น: การเติมของในกล่องเป็นงานหลังบ้านของเจ้าหน้าที่
-- ระบบไม่กั้นการยืมอีกต่อไป คืนแล้วยืมได้ทันที.
--
-- ต้อง recompute ก่อน drop: ชุดที่ค้าง needsCheck อยู่ตอนนี้ถูกกันออกจาก Item.availableQty
-- ไว้ (lib/stock recomputeItemCounts) — พอคอลัมน์หายไปเฉยๆ ไม่มีอะไรมาบวกมันกลับ.
-- สูตรตรงกับสาขา tracked ของ recomputeItemCounts: ชิ้นที่อยู่ในชุดสถานะ IN_USE อยู่แล้ว
-- จึงไม่ต้องกรอง inKitSubItemId ซ้ำ.
UPDATE items i
SET "availableQty" = (SELECT COUNT(*) FROM sub_items s WHERE s."itemId" = i.id AND s.status = 'AVAILABLE')
WHERE EXISTS (SELECT 1 FROM sub_items s WHERE s."itemId" = i.id AND s."needsCheck");

ALTER TABLE "sub_items" DROP COLUMN "needsCheck";
