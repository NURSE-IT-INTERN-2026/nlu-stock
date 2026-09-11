CREATE TABLE "ai_search_limits" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "ai_search_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "ai_search_limits_windowStart_idx" ON "ai_search_limits"("windowStart");
