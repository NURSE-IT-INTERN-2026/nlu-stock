-- Remember which assembled set a นำไปใช้งาน row filled. Tracked pieces already knew their box
-- (sub_items."inKitSubItemId"); a คงทน component did not, so ยกเลิกชุด had to read the recipe to
-- decide how much to hand back — and a recipe edited after assembly changed what an old box
-- returned. This column is what was actually cut.
ALTER TABLE "dispense_records" ADD COLUMN "kitSubItemId" TEXT;

ALTER TABLE "dispense_records"
  ADD CONSTRAINT "dispense_records_kitSubItemId_fkey"
  FOREIGN KEY ("kitSubItemId") REFERENCES "sub_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "dispense_records_kitSubItemId_idx" ON "dispense_records"("kitSubItemId");

-- Backfill from the note assemble already writes ("ประกอบอยู่ในชุด NLU-KIT-010-C01"), so sets
-- built before this column cancel off their real contents too.
UPDATE "dispense_records" d
SET "kitSubItemId" = s.id
FROM "sub_items" s
JOIN "items" i ON i.id = s."itemId"
WHERE d."loanType" = 'INUSE'
  AND d."kitSubItemId" IS NULL
  AND d.notes = 'ประกอบอยู่ในชุด ' || i.code || '-' || s."subCode";
