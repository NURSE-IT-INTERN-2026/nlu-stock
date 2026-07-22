-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('BORROW', 'INUSE');

-- AlterTable
ALTER TABLE "dispense_records" ADD COLUMN     "loanType" "LoanType";
