-- AlterTable
ALTER TABLE "maintenance_records" ALTER COLUMN "attachmentUrls" SET DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "attachment_logs" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachment_logs_recordType_recordId_at_idx" ON "attachment_logs"("recordType", "recordId", "at");

-- AddForeignKey
ALTER TABLE "attachment_logs" ADD CONSTRAINT "attachment_logs_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
