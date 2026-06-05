/*
  Warnings:

  - You are about to drop the column `subjectId` on the `dispense_records` table. All the data in the column will be lost.
  - You are about to drop the `subjects` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('COURSE', 'ACTIVITY', 'OTHER');

-- DropForeignKey
ALTER TABLE "dispense_records" DROP CONSTRAINT "dispense_records_subjectId_fkey";

-- DropIndex
DROP INDEX "dispense_records_subjectId_dispensedAt_idx";

-- DropIndex
DROP INDEX "items_issueUnitId_idx";

-- DropIndex
DROP INDEX "items_subUnitId_idx";

-- AlterTable
ALTER TABLE "dispense_records" DROP COLUMN "subjectId",
ADD COLUMN     "usageNote" TEXT,
ADD COLUMN     "usageType" "UsageType";

-- DropTable
DROP TABLE "subjects";

-- CreateIndex
CREATE INDEX "dispense_records_usageType_dispensedAt_idx" ON "dispense_records"("usageType", "dispensedAt");
