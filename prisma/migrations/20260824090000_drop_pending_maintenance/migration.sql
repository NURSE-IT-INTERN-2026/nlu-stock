-- PENDING_MAINTENANCE ออกจาก ItemStatus
--
-- ค่านี้มาจาก model แรกที่คิดว่าบำรุงรักษาจะเป็น "สถานะ" — ของถึงรอบแล้วค้างไว้รอคนไปทำ.
-- ระบบจริงไม่ได้เดินทางนั้น: บำรุงรักษาเป็นเรื่องของวันที่ (Item.nextMaintenanceDate) ของยัง
-- พร้อมใช้อยู่ตลอด แค่มีวันนัดห้อยไว้. ค่านี้จึงไม่มีใครเขียนได้เลยตั้งแต่ต้น — ALLOWED_TRANSITIONS
-- ให้มันเป็น node ที่เข้าไม่ได้ออกไม่ได้ และไม่มี write path ไหนในแอปตั้งค่านี้.
--
-- UPDATE สี่บรรทัดข้างล่างคือกันเหนียวสำหรับฐานที่ไม่ใช่ dev: ที่นี่นับได้ 0 ทั้งสี่คอลัมน์ แต่ถ้า
-- ฐานอื่นมีแถวหลุดมาจากยุคก่อน การ cast จะล้มทั้ง migration. AVAILABLE คือค่าที่ตรงกับความจริง
-- ของแถวพวกนั้น — ของชิ้นนั้นใช้งานได้ ไม่เคยพัง แค่ถึงรอบบำรุง ซึ่งตอนนี้อ่านจากวันที่แทน.
UPDATE "items" SET "status" = 'AVAILABLE' WHERE "status" = 'PENDING_MAINTENANCE';
UPDATE "sub_items" SET "status" = 'AVAILABLE' WHERE "status" = 'PENDING_MAINTENANCE';
UPDATE "item_status_logs" SET "newStatus" = 'AVAILABLE' WHERE "newStatus" = 'PENDING_MAINTENANCE';
UPDATE "item_status_logs" SET "previousStatus" = 'AVAILABLE' WHERE "previousStatus" = 'PENDING_MAINTENANCE';

-- Postgres ไม่มี ALTER TYPE ... DROP VALUE — ต้องสร้าง type ใหม่แล้วย้ายทุกคอลัมน์มา
ALTER TYPE "ItemStatus" RENAME TO "ItemStatus_old";
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'ON_LOAN', 'IN_USE', 'DAMAGED', 'UNDER_REPAIR', 'LOST', 'DISPOSED');

ALTER TABLE "items" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sub_items" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "items" ALTER COLUMN "status" TYPE "ItemStatus" USING ("status"::text::"ItemStatus");
ALTER TABLE "sub_items" ALTER COLUMN "status" TYPE "ItemStatus" USING ("status"::text::"ItemStatus");
ALTER TABLE "item_status_logs" ALTER COLUMN "newStatus" TYPE "ItemStatus" USING ("newStatus"::text::"ItemStatus");
ALTER TABLE "item_status_logs" ALTER COLUMN "previousStatus" TYPE "ItemStatus" USING ("previousStatus"::text::"ItemStatus");

ALTER TABLE "items" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
ALTER TABLE "sub_items" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';

DROP TYPE "ItemStatus_old";
