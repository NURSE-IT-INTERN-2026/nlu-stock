-- CreateTable
CREATE TABLE "kit_bom" (
    "id" TEXT NOT NULL,
    "kitItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kit_bom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kit_bom_kitItemId_idx" ON "kit_bom"("kitItemId");

-- AddForeignKey
ALTER TABLE "kit_bom" ADD CONSTRAINT "kit_bom_kitItemId_fkey" FOREIGN KEY ("kitItemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_bom" ADD CONSTRAINT "kit_bom_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
