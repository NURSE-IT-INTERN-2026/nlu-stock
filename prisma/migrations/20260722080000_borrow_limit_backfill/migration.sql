-- Existing borrowable items predate borrowLimit; keep them borrowable by seeding
-- the limit from their stock (at least 1). borrowable is derived from it from now on.
UPDATE "items" SET "borrowLimit" = GREATEST("totalQty", 1) WHERE "borrowable" = true AND "borrowLimit" = 0;
