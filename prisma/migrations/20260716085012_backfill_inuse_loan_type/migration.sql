-- Backfill loanType for legacy open dispense records that are actually "ตั้งใช้ในห้อง" (INUSE):
-- the sub-item is IN_USE and the record was never returned. Idempotent — only touches rows still null.
UPDATE "dispense_records"
SET "loanType" = 'INUSE'
WHERE "returnedAt" IS NULL
  AND "loanType" IS NULL
  AND "subItemId" IS NOT NULL
  AND "subItemId" IN (SELECT id FROM "sub_items" WHERE "status" = 'IN_USE');
