-- Drop the label prefix from the notes of repair-recovery rows.
--
-- Before the reason column could say "รับคืนจากซ่อม", lib/stock restoreDamagedQty wrote the label
-- into the note itself: "รับคืนจากซ่อม (แตก) — เปลี่ยนอะไหล่แล้ว". The history now prints the
-- reason as the row's headline, so the prefix shows up twice on the same row. New rows carry
-- only what a human typed; this makes the old ones match.
--
--   "รับคืนจากซ่อม (แตก) — เปลี่ยนอะไหล่แล้ว" → "แตก — เปลี่ยนอะไหล่แล้ว"
--   "ยกเลิกคำขอชำรุด"                        → NULL
UPDATE "stock_adjustments"
SET "notes" = NULLIF(
  regexp_replace(
    regexp_replace("notes", '^(รับคืนจากซ่อม|ยกเลิกคำขอชำรุด)\s*\((.*?)\)', '\2'),
    '^(รับคืนจากซ่อม|ยกเลิกคำขอชำรุด)\s*(— )?', ''
  ),
  ''
)
WHERE "reason" IN ('REPAIR_RETURN', 'DAMAGE_CANCELLED') AND "notes" IS NOT NULL;
