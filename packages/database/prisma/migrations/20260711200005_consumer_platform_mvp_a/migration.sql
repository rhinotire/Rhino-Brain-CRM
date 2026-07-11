-- CreateEnum
CREATE TYPE "InstallerPreferredStatus" AS ENUM ('OWNED', 'PREFERRED', 'PARTNER', 'PROSPECT');

-- CreateEnum
CREATE TYPE "ConsumerLeadKind" AS ENUM ('INSTALLED_PRICE', 'APPOINTMENT', 'INSTALLER_NEEDED', 'SEND_TO_INSTALLER');

-- CreateEnum
CREATE TYPE "ConsumerLeadStatus" AS ENUM ('SUBMITTED', 'INSTALLER_NEEDED', 'IDEAL_ELIGIBLE', 'PARTNER_MATCHED', 'EXISTING_DEALER_MATCHED', 'NEW_INSTALLER_PROSPECT', 'POSSIBLE_DUPLICATE', 'SALES_REVIEW', 'INSTALLER_CONTACTED', 'INSTALLER_REQUEST_OPENED', 'INSTALLER_ACCEPTED', 'INSTALLER_DECLINED', 'AWAITING_WHOLESALE_QUOTE', 'QUOTE_CREATED', 'QUOTE_SENT', 'ORDER_CONFIRMED', 'PRODUCT_RESERVED', 'INSTALLATION_REQUESTED', 'INSTALLATION_SCHEDULED', 'INSTALLATION_COMPLETED', 'LOST', 'CANCELLED', 'EXPIRED', 'MANUAL_ASSISTANCE_REQUIRED');

-- CreateTable
CREATE TABLE "BrandConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneDisplay" TEXT NOT NULL,
    "addressJson" JSONB,
    "networkName" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installer" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "customerId" TEXT,
    "storeName" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "serviceRadiusMi" INTEGER NOT NULL DEFAULT 35,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notifyEmail" TEXT,
    "website" TEXT,
    "hoursJson" JSONB,
    "passenger" BOOLEAN NOT NULL DEFAULT true,
    "lightTruck" BOOLEAN NOT NULL DEFAULT true,
    "trailer" BOOLEAN NOT NULL DEFAULT false,
    "tbr" BOOLEAN NOT NULL DEFAULT false,
    "wheels" BOOLEAN NOT NULL DEFAULT false,
    "mobileService" BOOLEAN NOT NULL DEFAULT false,
    "maxWheelSize" INTEGER,
    "appointmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sameDayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preferredStatus" "InstallerPreferredStatus" NOT NULL DEFAULT 'PROSPECT',
    "assignedRepId" TEXT,
    "responseScore" INTEGER NOT NULL DEFAULT 0,
    "publicPageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerLead" (
    "id" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "zip" TEXT NOT NULL,
    "vehicleJson" JSONB,
    "preferredContact" TEXT NOT NULL DEFAULT 'phone',
    "preferredDate" TIMESTAMP(3),
    "message" TEXT,
    "productId" TEXT,
    "tireSize" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 4,
    "kind" "ConsumerLeadKind" NOT NULL,
    "status" "ConsumerLeadStatus" NOT NULL DEFAULT 'SUBMITTED',
    "installerId" TEXT,
    "locationId" TEXT,
    "assignedRepId" TEXT,
    "consumerToken" TEXT NOT NULL,
    "crmLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumerLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerConsent" (
    "id" TEXT NOT NULL,
    "consumerLeadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CONTACT',
    "textShown" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralStatusHistory" (
    "id" TEXT NOT NULL,
    "consumerLeadId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "brandKey" TEXT,
    "zip" TEXT,
    "productId" TEXT,
    "consumerLeadId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandConfig_key_key" ON "BrandConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BrandConfig_domain_key" ON "BrandConfig"("domain");

-- CreateIndex
CREATE INDEX "Installer_zip_idx" ON "Installer"("zip");

-- CreateIndex
CREATE INDEX "Installer_locationId_active_idx" ON "Installer"("locationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumerLead_consumerToken_key" ON "ConsumerLead"("consumerToken");

-- CreateIndex
CREATE INDEX "ConsumerLead_status_idx" ON "ConsumerLead"("status");

-- CreateIndex
CREATE INDEX "ConsumerLead_zip_idx" ON "ConsumerLead"("zip");

-- CreateIndex
CREATE INDEX "ConsumerLead_brandKey_createdAt_idx" ON "ConsumerLead"("brandKey", "createdAt");

-- CreateIndex
CREATE INDEX "ConsumerConsent_consumerLeadId_idx" ON "ConsumerConsent"("consumerLeadId");

-- CreateIndex
CREATE INDEX "ReferralStatusHistory_consumerLeadId_createdAt_idx" ON "ReferralStatusHistory"("consumerLeadId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_event_createdAt_idx" ON "AnalyticsEvent"("event", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_zip_idx" ON "AnalyticsEvent"("zip");

-- AddForeignKey
ALTER TABLE "BrandConfig" ADD CONSTRAINT "BrandConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installer" ADD CONSTRAINT "Installer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installer" ADD CONSTRAINT "Installer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installer" ADD CONSTRAINT "Installer_assignedRepId_fkey" FOREIGN KEY ("assignedRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerLead" ADD CONSTRAINT "ConsumerLead_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerLead" ADD CONSTRAINT "ConsumerLead_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "Installer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerLead" ADD CONSTRAINT "ConsumerLead_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerLead" ADD CONSTRAINT "ConsumerLead_assignedRepId_fkey" FOREIGN KEY ("assignedRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerLead" ADD CONSTRAINT "ConsumerLead_crmLeadId_fkey" FOREIGN KEY ("crmLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerConsent" ADD CONSTRAINT "ConsumerConsent_consumerLeadId_fkey" FOREIGN KEY ("consumerLeadId") REFERENCES "ConsumerLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralStatusHistory" ADD CONSTRAINT "ReferralStatusHistory_consumerLeadId_fkey" FOREIGN KEY ("consumerLeadId") REFERENCES "ConsumerLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

