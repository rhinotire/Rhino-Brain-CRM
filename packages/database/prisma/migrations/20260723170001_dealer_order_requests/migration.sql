-- CreateEnum
CREATE TYPE "DealerOrderStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DealerOrderRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dealerUserId" TEXT NOT NULL,
    "status" "DealerOrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "poNumber" TEXT,
    "notes" TEXT,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerOrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerOrderRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "DealerOrderRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealerOrderRequest_requestNumber_key" ON "DealerOrderRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "DealerOrderRequest_customerId_createdAt_idx" ON "DealerOrderRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "DealerOrderRequest_status_idx" ON "DealerOrderRequest"("status");

-- CreateIndex
CREATE INDEX "DealerOrderRequestItem_requestId_idx" ON "DealerOrderRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "DealerOrderRequestItem_productId_idx" ON "DealerOrderRequestItem"("productId");

-- AddForeignKey
ALTER TABLE "DealerOrderRequest" ADD CONSTRAINT "DealerOrderRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerOrderRequest" ADD CONSTRAINT "DealerOrderRequest_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "DealerUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerOrderRequestItem" ADD CONSTRAINT "DealerOrderRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DealerOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerOrderRequestItem" ADD CONSTRAINT "DealerOrderRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
