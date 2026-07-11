-- CreateEnum
CREATE TYPE "ReferralMatchStatus" AS ENUM ('EXISTING_DEALER', 'EXISTING_INSTALLER', 'POSSIBLE_DUPLICATE', 'NEW_PROSPECT');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONTACTED', 'OPENED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "CustomerSource" ADD VALUE 'CONSUMER_REFERRAL';

-- CreateTable
CREATE TABLE "InstallerReferral" (
    "id" TEXT NOT NULL,
    "consumerLeadId" TEXT NOT NULL,
    "rawName" TEXT,
    "rawPhone" TEXT,
    "rawAddress" TEXT,
    "rawZip" TEXT,
    "rawWebsite" TEXT,
    "matchStatus" "ReferralMatchStatus" NOT NULL,
    "matchedCustomerId" TEXT,
    "installerId" TEXT,
    "secureToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "quoteId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallerReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallerReferral_consumerLeadId_key" ON "InstallerReferral"("consumerLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallerReferral_secureToken_key" ON "InstallerReferral"("secureToken");

-- CreateIndex
CREATE INDEX "InstallerReferral_status_expiresAt_idx" ON "InstallerReferral"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "InstallerReferral" ADD CONSTRAINT "InstallerReferral_consumerLeadId_fkey" FOREIGN KEY ("consumerLeadId") REFERENCES "ConsumerLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerReferral" ADD CONSTRAINT "InstallerReferral_matchedCustomerId_fkey" FOREIGN KEY ("matchedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerReferral" ADD CONSTRAINT "InstallerReferral_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "Installer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallerReferral" ADD CONSTRAINT "InstallerReferral_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

