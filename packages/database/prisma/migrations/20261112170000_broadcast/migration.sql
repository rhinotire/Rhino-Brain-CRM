-- Size/brand broadcast feature. Additive only: three new tables.
CREATE TABLE "CustomerSizeHistory" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerId" TEXT,
    "sizeKey" TEXT NOT NULL,
    "sizeDisplay" TEXT NOT NULL,
    "brand" TEXT,
    "units" INTEGER NOT NULL,
    "lastBoughtAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSizeHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerSizeHistory_company_customerName_sizeKey_key" ON "CustomerSizeHistory"("company", "customerName", "sizeKey");
CREATE INDEX "CustomerSizeHistory_company_sizeKey_idx" ON "CustomerSizeHistory"("company", "sizeKey");
CREATE INDEX "CustomerSizeHistory_customerId_idx" ON "CustomerSizeHistory"("customerId");

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sizeKey" TEXT,
    "label" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Broadcast_company_createdAt_idx" ON "Broadcast"("company", "createdAt");

CREATE TABLE "SmsOptOut" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmsOptOut_phone_key" ON "SmsOptOut"("phone");
