-- CreateTable
CREATE TABLE "return_records" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subItemId" TEXT,
    "dispenseRecordId" TEXT,
    "quantity" INTEGER NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "notes" TEXT,
    "returnedBy" TEXT NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "return_records_itemId_returnedAt_idx" ON "return_records"("itemId", "returnedAt");

-- CreateIndex
CREATE INDEX "return_records_subItemId_idx" ON "return_records"("subItemId");

-- AddForeignKey
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_subItemId_fkey" FOREIGN KEY ("subItemId") REFERENCES "sub_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_dispenseRecordId_fkey" FOREIGN KEY ("dispenseRecordId") REFERENCES "dispense_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_returnedBy_fkey" FOREIGN KEY ("returnedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
