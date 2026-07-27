-- CreateEnum
CREATE TYPE "FreightEquipment" AS ENUM ('DRY_VAN_53', 'FLATBED_53');

-- CreateEnum
CREATE TYPE "FreightShipmentStatus" AS ENUM ('QUOTING', 'BOOKED', 'PICKED_UP', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FreightQuoteStatus" AS ENUM ('SENT', 'QUOTED', 'DECLINED', 'NEEDS_ATTENTION', 'SEND_FAILED');

-- CreateTable
CREATE TABLE "FreightCarrier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "mcNumber" TEXT,
    "equipmentTypes" "FreightEquipment"[],
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreightCarrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightCarrierContact" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FreightCarrierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightConsignee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "deliveryNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreightConsignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightShipment" (
    "id" TEXT NOT NULL,
    "refCode" TEXT NOT NULL,
    "originAddress" TEXT NOT NULL,
    "originLabel" TEXT NOT NULL DEFAULT 'Orlando, FL',
    "equipmentType" "FreightEquipment" NOT NULL,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "commodity" TEXT NOT NULL DEFAULT 'tires',
    "notes" TEXT,
    "status" "FreightShipmentStatus" NOT NULL DEFAULT 'QUOTING',
    "awardedQuoteId" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "locationId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreightShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightShipmentStop" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "consigneeId" TEXT NOT NULL,
    "quantity" TEXT,
    "notes" TEXT,

    CONSTRAINT "FreightShipmentStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightQuote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "status" "FreightQuoteStatus" NOT NULL DEFAULT 'SENT',
    "price" DECIMAL(10,2),
    "transitDays" INTEGER,
    "notes" TEXT,
    "rawReplyExcerpt" TEXT,
    "parsedByAi" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "FreightQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreightCarrierContact_carrierId_idx" ON "FreightCarrierContact"("carrierId");

-- CreateIndex
CREATE INDEX "FreightCarrierContact_email_idx" ON "FreightCarrierContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FreightShipment_refCode_key" ON "FreightShipment"("refCode");

-- CreateIndex
CREATE UNIQUE INDEX "FreightShipment_awardedQuoteId_key" ON "FreightShipment"("awardedQuoteId");

-- CreateIndex
CREATE INDEX "FreightShipment_status_idx" ON "FreightShipment"("status");

-- CreateIndex
CREATE INDEX "FreightShipment_locationId_idx" ON "FreightShipment"("locationId");

-- CreateIndex
CREATE INDEX "FreightShipmentStop_consigneeId_idx" ON "FreightShipmentStop"("consigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "FreightShipmentStop_shipmentId_sequence_key" ON "FreightShipmentStop"("shipmentId", "sequence");

-- CreateIndex
CREATE INDEX "FreightQuote_status_idx" ON "FreightQuote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FreightQuote_shipmentId_carrierId_key" ON "FreightQuote"("shipmentId", "carrierId");

-- AddForeignKey
ALTER TABLE "FreightCarrierContact" ADD CONSTRAINT "FreightCarrierContact_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "FreightCarrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightShipment" ADD CONSTRAINT "FreightShipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightShipment" ADD CONSTRAINT "FreightShipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightShipmentStop" ADD CONSTRAINT "FreightShipmentStop_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "FreightShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightShipmentStop" ADD CONSTRAINT "FreightShipmentStop_consigneeId_fkey" FOREIGN KEY ("consigneeId") REFERENCES "FreightConsignee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightQuote" ADD CONSTRAINT "FreightQuote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "FreightShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightQuote" ADD CONSTRAINT "FreightQuote_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "FreightCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

