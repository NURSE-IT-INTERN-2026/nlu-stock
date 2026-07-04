-- AlterTable
ALTER TABLE "dispense_records" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "loanGroupId" TEXT;

-- CreateIndex
CREATE INDEX "dispense_records_loanGroupId_idx" ON "dispense_records"("loanGroupId");
