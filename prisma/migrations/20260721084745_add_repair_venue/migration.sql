-- CreateEnum
CREATE TYPE "RepairVenue" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "item_status_logs" ADD COLUMN     "repairVenue" "RepairVenue";
