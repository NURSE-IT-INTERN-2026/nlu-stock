-- AlterTable
ALTER TABLE "dispense_records" ADD COLUMN     "returnProofUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
