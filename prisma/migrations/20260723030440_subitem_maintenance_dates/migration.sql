-- AlterTable
ALTER TABLE "sub_items" ADD COLUMN     "lastMaintenanceDate" TIMESTAMP(3),
ADD COLUMN     "nextMaintenanceDate" TIMESTAMP(3);

-- Backfill: tracked items carried the maintenance schedule on the parent item.
-- Copy each parent's dates down to every copy so existing pieces keep their cycle
-- once the source of truth moves to the sub-item.
UPDATE "sub_items" s
SET "lastMaintenanceDate" = i."lastMaintenanceDate",
    "nextMaintenanceDate" = i."nextMaintenanceDate"
FROM "items" i
WHERE s."itemId" = i.id AND i."trackIndividually" = true;
