CREATE TYPE "PosOrderStatus" AS ENUM ('PENDING_CONFIRM', 'CONFIRMED', 'SUBMITTED', 'FAILED', 'CANCELLED');
CREATE TABLE "PosOrderRequest" (
    "id" TEXT NOT NULL,
    "phoneFrom" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" "PosOrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total" DECIMAL(12,2),
    "notes" TEXT,
    "workOrderNo" TEXT,
    "error" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    CONSTRAINT "PosOrderRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PosOrderRequest_status_idx" ON "PosOrderRequest"("status");
ALTER TABLE "PosOrderRequest" ADD CONSTRAINT "PosOrderRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosOrderRequest" ADD CONSTRAINT "PosOrderRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
