-- CreateTable
CREATE TABLE "location_change_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_change_logs_itemId_changedAt_idx" ON "location_change_logs"("itemId", "changedAt");

-- AddForeignKey
ALTER TABLE "location_change_logs" ADD CONSTRAINT "location_change_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_change_logs" ADD CONSTRAINT "location_change_logs_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
