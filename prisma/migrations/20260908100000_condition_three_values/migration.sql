-- สภาพของ 6 ค่า -> 3. ใหม่/ใช้งานได้ = ดี, เก่า/พอใช้ = ปานกลาง, ใช้ไม่ได้/ชำรุด = ชำรุด.
-- Postgres cannot drop a value from an enum, so the type is rebuilt and the column recast.
ALTER TYPE "ItemCondition" RENAME TO "ItemCondition_old";

CREATE TYPE "ItemCondition" AS ENUM ('GOOD', 'FAIR', 'DAMAGED');

ALTER TABLE "sub_items"
  ALTER COLUMN "condition" TYPE "ItemCondition"
  USING (
    CASE "condition"::text
      WHEN 'NEW' THEN 'GOOD'
      WHEN 'USABLE' THEN 'GOOD'
      WHEN 'OLD' THEN 'FAIR'
      WHEN 'FAIR' THEN 'FAIR'
      ELSE 'DAMAGED'
    END
  )::"ItemCondition";

DROP TYPE "ItemCondition_old";
