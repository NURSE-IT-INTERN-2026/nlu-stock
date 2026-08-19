/*
  Warnings:

  - Made the column `loanType` on table `dispense_records` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "dispense_records" ALTER COLUMN "loanType" SET NOT NULL;
