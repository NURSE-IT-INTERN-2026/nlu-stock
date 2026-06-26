-- Split COUNT_MISMATCH into COUNT_MISMATCH_SHORT (ขาด) and COUNT_MISMATCH_OVER (เกิน).
-- Postgres cannot drop an enum value directly, so recreate the type.
ALTER TYPE "AdjustmentReason" RENAME TO "AdjustmentReason_old";

CREATE TYPE "AdjustmentReason" AS ENUM ('LOST', 'DAMAGED_PENDING_REPAIR', 'COUNT_MISMATCH_SHORT', 'COUNT_MISMATCH_OVER', 'DISPOSAL', 'OTHER');

-- Map any legacy COUNT_MISMATCH rows to COUNT_MISMATCH_SHORT before swapping the column type.
ALTER TABLE "stock_adjustments" ALTER COLUMN "reason" TYPE "AdjustmentReason" USING
  CASE "reason"::text
    WHEN 'COUNT_MISMATCH' THEN 'COUNT_MISMATCH_SHORT'::"AdjustmentReason"
    ELSE "reason"::text::"AdjustmentReason"
  END;

DROP TYPE "AdjustmentReason_old";
