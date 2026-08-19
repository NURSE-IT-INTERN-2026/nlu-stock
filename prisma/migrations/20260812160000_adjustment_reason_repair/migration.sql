-- The two ways an open ชำรุด booking closes get their own reasons.
--
-- Both were booked as OTHER, so the row that hands repaired stock back to the shelf printed
-- "อื่นๆ" in the history — over the one row whose reason is the entire point of it. Reports and
-- exports read the same label map, so they were blind to it too.
--
-- BEFORE 'OTHER' keeps the physical order the same as prisma/schema.prisma. Adding the values
-- is its own migration because Postgres will not let a new enum value be USED in the
-- transaction that added it — the backfill is the next migration.
ALTER TYPE "AdjustmentReason" ADD VALUE 'REPAIR_RETURN' BEFORE 'OTHER';
ALTER TYPE "AdjustmentReason" ADD VALUE 'DAMAGE_CANCELLED' BEFORE 'OTHER';
