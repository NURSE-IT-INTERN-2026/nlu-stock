-- ยืมเอง: per-item switches read by /api/borrow. Default true/1 because the real gate is the
-- profile rule in lib/self-borrow.ts (consumables and ครุภัณฑ์ are shut regardless), so this
-- column only ever needs flipping for the odd durable that should not go out unattended.
ALTER TABLE "items" ADD COLUMN "selfBorrowable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "items" ADD COLUMN "selfBorrowLimit" INTEGER NOT NULL DEFAULT 1;
