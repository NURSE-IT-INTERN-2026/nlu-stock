-- Backfill the rows written before the reasons above existed.
--
-- The prefix is the `label` lib/stock restoreDamagedQty puts at the front of every audit note,
-- so it identifies these rows exactly. This is the last time anything reads that string: from
-- here the reason column answers the question on its own.
UPDATE "stock_adjustments"
SET "reason" = 'REPAIR_RETURN'
WHERE "reason" = 'OTHER' AND "notes" LIKE 'รับคืนจากซ่อม%';

UPDATE "stock_adjustments"
SET "reason" = 'DAMAGE_CANCELLED'
WHERE "reason" = 'OTHER' AND "notes" LIKE 'ยกเลิกคำขอชำรุด%';
