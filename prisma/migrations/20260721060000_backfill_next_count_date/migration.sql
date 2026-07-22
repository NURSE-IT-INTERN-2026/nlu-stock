-- Backfill the first stock-count due date for items that existed before the
-- count cycle was introduced. Baseline = createdAt (we have no count history),
-- cycle = the profile default: 3 months for consumables, 12 months otherwise.
-- Items older than their cycle land in the past and show up as due immediately.
UPDATE items i
SET "nextCountDate" = i."createdAt" + (
  CASE WHEN p."dispenseType" = 'CONSUMABLE' THEN INTERVAL '3 months' ELSE INTERVAL '12 months' END
)
FROM categories c, category_profiles p
WHERE i."categoryId" = c.id
  AND c."profileId" = p.id
  AND i."nextCountDate" IS NULL;
