-- Free-text BOM rows carried component names imported from Excel with no Item behind them.
-- assemble always skipped them and the recipe editor could not touch them, so they could only
-- ever be printed as a caption on the ชุดประกอบ tab. Staff link real components by hand, so a
-- row with no item is noise rather than an unfinished recipe line. Drop them and require the
-- link from here on.
DELETE FROM "kit_bom" WHERE "componentItemId" IS NULL;

ALTER TABLE "kit_bom" ALTER COLUMN "componentItemId" SET NOT NULL;
