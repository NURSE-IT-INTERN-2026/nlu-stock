-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'OLD', 'USABLE', 'UNUSABLE', 'DAMAGED');

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- Seed units from existing data
INSERT INTO "units" ("id", "name") VALUES
  (gen_random_uuid(), 'กล่อง'),
  (gen_random_uuid(), 'ถุง'),
  (gen_random_uuid(), 'ชิ้น'),
  (gen_random_uuid(), 'set'),
  (gen_random_uuid(), 'ชุด'),
  (gen_random_uuid(), 'ห่อ'),
  (gen_random_uuid(), 'เครื่อง'),
  (gen_random_uuid(), 'อัน'),
  (gen_random_uuid(), 'แผง'),
  (gen_random_uuid(), 'กระปุก'),
  (gen_random_uuid(), 'กรัม'),
  (gen_random_uuid(), 'เม็ด'),
  (gen_random_uuid(), 'ซีซี');

-- Add new columns (nullable first to allow existing rows)
ALTER TABLE "items" ADD COLUMN "issueUnitId" TEXT;
ALTER TABLE "items" ADD COLUMN "subUnitId" TEXT;

-- Migrate existing data: map old string values to new unit ids
UPDATE "items" SET "issueUnitId" = (SELECT "id" FROM "units" WHERE "units"."name" = "items"."issueUnit");
UPDATE "items" SET "subUnitId" = (SELECT "id" FROM "units" WHERE "units"."name" = "items"."subUnit");

-- Set defaults for any unmatched rows (use 'ชิ้น' as fallback)
UPDATE "items" SET "issueUnitId" = (SELECT "id" FROM "units" WHERE "name" = 'ชิ้น') WHERE "issueUnitId" IS NULL;
UPDATE "items" SET "subUnitId" = (SELECT "id" FROM "units" WHERE "name" = 'ชิ้น') WHERE "subUnitId" IS NULL;

-- Now make columns NOT NULL
ALTER TABLE "items" ALTER COLUMN "issueUnitId" SET NOT NULL;
ALTER TABLE "items" ALTER COLUMN "subUnitId" SET NOT NULL;

-- Drop old columns
ALTER TABLE "items" DROP COLUMN "issueUnit";
ALTER TABLE "items" DROP COLUMN "subUnit";

-- Add foreign keys
ALTER TABLE "items" ADD CONSTRAINT "items_issueUnitId_fkey" FOREIGN KEY ("issueUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_subUnitId_fkey" FOREIGN KEY ("subUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Alter condition column type
ALTER TABLE "sub_items" DROP COLUMN "condition";
ALTER TABLE "sub_items" ADD COLUMN "condition" "ItemCondition";

-- CreateIndex
CREATE INDEX "items_issueUnitId_idx" ON "items"("issueUnitId");
CREATE INDEX "items_subUnitId_idx" ON "items"("subUnitId");
