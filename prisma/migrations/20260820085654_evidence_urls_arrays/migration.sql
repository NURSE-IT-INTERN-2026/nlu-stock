-- หลักฐานแนบ: one file per event → up to five.
--
-- Hand-written on purpose. `prisma migrate dev` wanted to DROP each column and ADD the array
-- next to it, which would have thrown away every ส่งซ่อม/ชำรุด photo already on record. These
-- ALTER ... USING conversions keep them: a row that had a URL keeps it as a one-element array.
--
-- Empty strings collapse to '{}' alongside NULL — a legacy blank would otherwise become
-- ARRAY[''], a one-element array pointing at no file, which the UI would draw as a broken
-- thumbnail rather than as "no attachment".

-- stock_adjustments.imageEvidence → imageEvidenceUrls (qty stock: ส่งซ่อม/ชำรุด/สูญหาย)
ALTER TABLE "stock_adjustments" RENAME COLUMN "imageEvidence" TO "imageEvidenceUrls";
ALTER TABLE "stock_adjustments" ALTER COLUMN "imageEvidenceUrls" DROP DEFAULT;
ALTER TABLE "stock_adjustments" ALTER COLUMN "imageEvidenceUrls" TYPE TEXT[]
  USING CASE
    WHEN "imageEvidenceUrls" IS NULL OR "imageEvidenceUrls" = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY["imageEvidenceUrls"]
  END;
ALTER TABLE "stock_adjustments" ALTER COLUMN "imageEvidenceUrls" SET DEFAULT ARRAY[]::TEXT[];

-- item_status_logs.imageUrl → imageUrls (tracked pieces: their only evidence store)
ALTER TABLE "item_status_logs" RENAME COLUMN "imageUrl" TO "imageUrls";
ALTER TABLE "item_status_logs" ALTER COLUMN "imageUrls" DROP DEFAULT;
ALTER TABLE "item_status_logs" ALTER COLUMN "imageUrls" TYPE TEXT[]
  USING CASE
    WHEN "imageUrls" IS NULL OR "imageUrls" = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY["imageUrls"]
  END;
ALTER TABLE "item_status_logs" ALTER COLUMN "imageUrls" SET DEFAULT ARRAY[]::TEXT[];
