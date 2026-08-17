-- KIT (อุปกรณ์ประกอบวิชา) becomes a one-shot tracked set.
--
-- Before: a KIT Item was CONSUMABLE — every assemble minted a brand new Item row and the
-- set was dispensed and gone, with no way to return it or to get its components back.
-- After: the KIT Item is the recipe (name + BOM, one row forever) and each physically
-- assembled set is a SubItem of it. Returning a set IS disassembling it.

-- Which set a tracked piece is inside right now; permanent history of the same on the log.
ALTER TABLE "sub_items" ADD COLUMN "inKitSubItemId" TEXT;
ALTER TABLE "sub_items" ADD CONSTRAINT "sub_items_inKitSubItemId_fkey"
  FOREIGN KEY ("inKitSubItemId") REFERENCES "sub_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sub_items_inKitSubItemId_idx" ON "sub_items"("inKitSubItemId");

ALTER TABLE "item_status_logs" ADD COLUMN "kitSubItemId" TEXT;

-- ยืม-คืน รายชิ้น: a set is now a piece with its own status and condition.
UPDATE "category_profiles" SET "dispenseType" = 'ITEM' WHERE "code" = 'KIT';

-- The CSV-imported KIT rows are recipes, not stock — nobody has assembled a set under the
-- new model yet, so their qty counters start at 0. totalQty tells the two states apart on
-- the inventory page: 0 = ยังไม่เคยประกอบ, >0 with availableQty 0 = ยืมออกหมด.
UPDATE "items" SET "trackIndividually" = true, "totalQty" = 0, "availableQty" = 0
WHERE "categoryId" IN (
  SELECT c."id" FROM "categories" c
  JOIN "category_profiles" p ON p."id" = c."profileId"
  WHERE p."code" = 'KIT'
);
