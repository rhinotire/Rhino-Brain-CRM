-- Per-customer purchase cadence mirrored from TireGuru "Customer Transaction
-- File" (reportID 83) for reorder / churn-risk alerts. Additive only: one new
-- table, one unique index, two indexes. No FK (customerId is a best-effort name
-- match, snapshot-refreshed), nothing else touched.
CREATE TABLE "CustomerReorder" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerId" TEXT,
    "lastPurchaseAt" TIMESTAMP(3) NOT NULL,
    "firstPurchaseAt" TIMESTAMP(3) NOT NULL,
    "purchaseCount" INTEGER NOT NULL,
    "totalSales" DECIMAL(12,2) NOT NULL,
    "avgIntervalDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerReorder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerReorder_company_customerName_key" ON "CustomerReorder"("company", "customerName");
CREATE INDEX "CustomerReorder_company_lastPurchaseAt_idx" ON "CustomerReorder"("company", "lastPurchaseAt");
CREATE INDEX "CustomerReorder_customerId_idx" ON "CustomerReorder"("customerId");
