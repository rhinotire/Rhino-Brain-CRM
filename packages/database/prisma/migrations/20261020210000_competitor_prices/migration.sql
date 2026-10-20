CREATE TABLE "CompetitorPrice" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "sizeKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "partCode" TEXT,
    "availability" TEXT,
    "fet" DECIMAL(10,2),
    "price" DECIMAL(12,2) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompetitorPrice_sizeKey_idx" ON "CompetitorPrice"("sizeKey");
CREATE INDEX "CompetitorPrice_site_sizeKey_idx" ON "CompetitorPrice"("site", "sizeKey");
