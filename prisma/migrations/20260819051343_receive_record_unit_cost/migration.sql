-- AlterTable
ALTER TABLE "receive_records" ADD COLUMN     "unitCost" DOUBLE PRECISION;

-- Backfill: every receipt that went into a lot inherits that lot's unit cost. It is the
-- only price this system ever recorded, and without it ค่าใช้จ่ายรายปี reads 0 for every
-- year already in the database. Durable receipts have no price anywhere to copy from and
-- stay null — unknown, not free.
UPDATE "receive_records" r
SET "unitCost" = l."unitCost"
FROM "lots" l
WHERE r."lotId" = l.id AND l."unitCost" IS NOT NULL;
