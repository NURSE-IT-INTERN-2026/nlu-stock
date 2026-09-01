-- Drop set tracking. setSize was never read by any stock/dispense/report code — it only
-- appended a `-Snn` segment to the item code that nothing ever parsed back out. Every item
-- that used it already spelled the count out in its name ("ชุดของเล่นไม้รูปสัตว์ (1 ชุด มี 8 ชิ้น)"),
-- which says more than the number could. Existing codes keep their `-Snn` segment: they are
-- opaque strings, and some are printed on QR labels already stuck to the items.
ALTER TABLE "category_profiles" DROP COLUMN "setTracking";
ALTER TABLE "items" DROP COLUMN "setSize";
