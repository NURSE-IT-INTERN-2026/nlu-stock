-- ยืมเอง เปิดทุกประเภท ยกเว้น อุปกรณ์ประกอบวิชา (KIT): ชุดสอนต้องผ่านเจ้าหน้าที่ เพราะระบบ
-- ไม่ตัดของสิ้นเปลืองที่อยู่ในชุดให้ คนยืมเองจะพาชุดที่ของข้างในไม่ครบออกไป
ALTER TABLE "category_profiles" ADD COLUMN "selfBorrowable" BOOLEAN NOT NULL DEFAULT true;
UPDATE "category_profiles" SET "selfBorrowable" = false WHERE "code" = 'KIT';
