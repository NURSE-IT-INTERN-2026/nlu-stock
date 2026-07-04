-- AlterEnum
ALTER TYPE "AdjustmentReason" ADD VALUE 'ASSEMBLY';

-- AlterTable
ALTER TABLE "kit_bom" ADD COLUMN     "componentItemId" TEXT;

-- CreateIndex
CREATE INDEX "kit_bom_componentItemId_idx" ON "kit_bom"("componentItemId");

-- AddForeignKey
ALTER TABLE "kit_bom" ADD CONSTRAINT "kit_bom_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
