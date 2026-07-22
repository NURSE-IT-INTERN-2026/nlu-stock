-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('AVAILABLE', 'DAMAGED', 'LOST');

-- AlterTable
ALTER TABLE "dispense_records" ADD COLUMN     "returnCondition" "ReturnCondition";
