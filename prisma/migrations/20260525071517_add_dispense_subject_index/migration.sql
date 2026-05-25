-- CreateIndex
CREATE INDEX "dispense_records_subjectId_dispensedAt_idx" ON "dispense_records"("subjectId", "dispensedAt");
