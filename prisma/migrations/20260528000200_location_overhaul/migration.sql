-- AlterTable: Location
-- Add new columns
ALTER TABLE "locations" ADD COLUMN "building" TEXT;
ALTER TABLE "locations" ADD COLUMN "floor" TEXT;
ALTER TABLE "locations" ADD COLUMN "detail" TEXT;

-- Backfill: migrate existing data (room-only → building=อาคาร 2, floor=ชั้น 4)
UPDATE "locations" SET "building" = 'อาคาร 2', "floor" = 'ชั้น 4' WHERE "building" IS NULL;

-- Make new columns NOT NULL
ALTER TABLE "locations" ALTER COLUMN "building" SET NOT NULL;
ALTER TABLE "locations" ALTER COLUMN "floor" SET NOT NULL;

-- Drop old unique constraint
DROP INDEX IF EXISTS "locations_room_cabinet_shelf_key";

-- Drop old columns
ALTER TABLE "locations" DROP COLUMN "cabinet";
ALTER TABLE "locations" DROP COLUMN "shelf";

-- Add new unique constraint
CREATE UNIQUE INDEX "locations_building_floor_room_detail_key" ON "locations"("building", "floor", "room", "detail");
