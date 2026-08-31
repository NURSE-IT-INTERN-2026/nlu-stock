-- เพดานยืมเองย้ายไปตั้งที่ประเภท: ตั้ง 5 ค่าแทนที่จะไล่ 918 แถว. รายชิ้นเหลือเป็น override
-- (NULL = ตามประเภท) แบบเดียวกับ countCycleMonths.
ALTER TABLE "category_profiles" ADD COLUMN "selfBorrowLimit" INTEGER NOT NULL DEFAULT 1;

-- ทุกแถวยังเป็น 1 ซึ่งเป็นค่า default ของ migration ก่อนหน้า ไม่ใช่ตัวเลขที่ใครตั้งไว้ —
-- ล้างเป็น NULL ให้หมด ไม่งั้นค่าที่ตั้งใหม่ที่ประเภทจะโดน override ที่ไม่มีใครตั้งใจบังทุกแถว.
ALTER TABLE "items" ALTER COLUMN "selfBorrowLimit" DROP NOT NULL;
ALTER TABLE "items" ALTER COLUMN "selfBorrowLimit" DROP DEFAULT;
UPDATE "items" SET "selfBorrowLimit" = NULL;
