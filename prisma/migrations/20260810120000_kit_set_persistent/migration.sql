-- A KIT set stops being one-shot and becomes persistent.
--
-- Before: ประกอบ → ยืม → คืน → the set died and its components went back to their own stock.
-- After: the set lives and is borrowed again and again. Stock is cut once, at assemble time.
-- Consumables are no longer cut by the system at all (the BOM counts ชิ้น while the item is
-- stocked in กล่อง — there is no conversion, so any cut would be wrong), so a returned set is
-- empty of them by definition. That is the whole reason for the column below.

-- Set on เบิก, cleared by the ยืนยัน button on ตรวจชุด. While true the set cannot be borrowed
-- and does not count towards its recipe's availableQty. Meaningless for every other sub-item.
ALTER TABLE "sub_items" ADD COLUMN "needsCheck" BOOLEAN NOT NULL DEFAULT false;
