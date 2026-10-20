CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "salesperson" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "qty" INTEGER NOT NULL,
    "sale" DECIMAL(12,2) NOT NULL,
    "gp" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PosSale_locationId_date_idx" ON "PosSale"("locationId", "date");
CREATE INDEX "PosSale_date_idx" ON "PosSale"("date");
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
