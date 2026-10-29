-- Per-SKU sell-through mirrored from TireGuru "Customer Transaction File"
-- (reportID 83) for restock suggestions. Additive only: one new table.
CREATE TABLE "ProductVelocity" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT,
    "description" TEXT,
    "unitsSold" INTEGER NOT NULL,
    "firstSoldAt" TIMESTAMP(3) NOT NULL,
    "lastSoldAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVelocity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductVelocity_company_sku_key" ON "ProductVelocity"("company", "sku");
CREATE INDEX "ProductVelocity_company_idx" ON "ProductVelocity"("company");
