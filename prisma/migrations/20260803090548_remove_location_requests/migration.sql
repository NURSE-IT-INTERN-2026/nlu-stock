/*
  Warnings:

  - You are about to drop the `location_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "location_requests" DROP CONSTRAINT "location_requests_requestedBy_fkey";

-- DropForeignKey
ALTER TABLE "location_requests" DROP CONSTRAINT "location_requests_resolvedLocationId_fkey";

-- DropForeignKey
ALTER TABLE "location_requests" DROP CONSTRAINT "location_requests_reviewedBy_fkey";

-- DropTable
DROP TABLE "location_requests";

-- DropEnum
DROP TYPE "LocationRequestStatus";
