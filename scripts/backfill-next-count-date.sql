-- Give every active item a first ตรวจนับ due date.
--
-- lib/alerts counts `nextCountDate IS NULL` as ถึงรอบตรวจนับ ("never counted → due now"),
-- which is the right predicate. But prisma/seed.ts never stamps the column, so a seeded
-- database has it null on 100% of items and the chip fires on every single one — 918 of 918
-- here, 54% of an alert badge that read 1685. An alert that fires on everything carries no
-- information. The write paths exist and work (settings/items, settings/import,
-- items/quick-create, and items/[id]/adjust on a real count); seeded rows just never went
-- through any of them.
--
--   * only nextCountDate. lastCountDate stays null on purpose — stamping it would claim a
--     count happened that nobody performed, and the audit trail is the one thing that must
--     not be invented. null there reads as "never counted", which is true.
--   * spread over the cycle, not now()+cycle. A flat stamp puts all 918 back on the same
--     day one cycle later and the badge returns to 1685 in a single night. Spreading means a
--     handful come due per week, which is what a count schedule is for.
--   * cycle from the category profile (CONSUMABLE 3 months, durables 12), with the per-item
--     countCycleMonths override — same rule as lib/stock-count countCycleFor. Kept in sync by
--     hand: this runs once, that runs forever.
--
-- prisma/seed.ts ทำเรื่องเดียวกันท้าย seed แล้ว (ออฟเซ็ตจาก md5(code) เพื่อให้ reseed ได้ผลเท่าเดิม
-- ตาม PRNG ที่ fix seed ไว้ทั้งไฟล์). สคริปต์นี้เหลือไว้ซ่อม DB ที่ seed ไปก่อนหน้านั้น.
--
-- Run once, against a database seeded without count dates:
--   docker exec -i realnlu-stock-db-1 psql -U nlu_stock -d nlu_stock -v ON_ERROR_STOP=1 < scripts/backfill-next-count-date.sql
--
-- Safe to re-run: the WHERE clause only touches rows that are still null.

UPDATE items i
SET "nextCountDate" = now() + (
  random() * COALESCE(
    i."countCycleMonths",
    CASE p."dispenseType" WHEN 'CONSUMABLE' THEN 3 ELSE 12 END
  )
) * interval '1 month'
FROM categories c, category_profiles p
WHERE c.id = i."categoryId"
  AND p.id = c."profileId"
  AND i."isActive" = true
  AND i."nextCountDate" IS NULL;
