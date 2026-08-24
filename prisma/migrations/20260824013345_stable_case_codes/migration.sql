-- CreateTable
CREATE TABLE "case_codes" (
    "sourceKey" TEXT NOT NULL,
    "be" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_codes_pkey" PRIMARY KEY ("sourceKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_codes_be_seq_key" ON "case_codes"("be", "seq");
