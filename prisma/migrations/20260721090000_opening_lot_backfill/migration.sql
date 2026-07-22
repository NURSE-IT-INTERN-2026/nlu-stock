-- Rescue consumable stock that predates the item's first lot.
--
-- A consumable's availableQty is its own counter until it has lots; after that it is
-- SUM(lots.remainingQty) (ADR-0002). Items that were imported with a balance and later
-- received into a lot ended up with availableQty > SUM(lots) — the difference is real
-- stock on the shelf that the next recompute would silently drop to zero.
--
-- Park that difference in an OPENING lot, dated to the item's creation so FIFO issues
-- it first. Receives now do this automatically (src/app/api/receive/route.ts).
INSERT INTO lots ("id", "itemId", "lotNumber", "receivedQty", "remainingQty", "receivedDate", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  i.id,
  'OPENING',
  i."availableQty" - COALESCE(SUM(l."remainingQty"), 0),
  i."availableQty" - COALESCE(SUM(l."remainingQty"), 0),
  i."createdAt",
  now(),
  now()
FROM items i
JOIN categories c ON c.id = i."categoryId"
JOIN category_profiles p ON p.id = c."profileId"
LEFT JOIN lots l ON l."itemId" = i.id
WHERE p."dispenseType" = 'CONSUMABLE'
GROUP BY i.id
HAVING count(l.id) > 0
   AND i."availableQty" - COALESCE(SUM(l."remainingQty"), 0) > 0
   AND NOT EXISTS (SELECT 1 FROM lots o WHERE o."itemId" = i.id AND o."lotNumber" = 'OPENING');
