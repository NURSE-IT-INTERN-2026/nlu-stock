-- AlterTable
ALTER TABLE "dispense_records" ADD COLUMN     "courseCode" TEXT;

-- CreateTable
CREATE TABLE "courses" (
    "code" TEXT NOT NULL,
    "name" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "dispense_records_courseCode_dispensedAt_idx" ON "dispense_records"("courseCode", "dispensedAt");
