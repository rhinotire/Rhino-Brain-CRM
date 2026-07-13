-- CreateEnum
CREATE TYPE "SpecProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "bestSeller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specialOffer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TireSpec" ADD COLUMN     "evCompatible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mileageWarrantyMiles" INTEGER,
ADD COLUMN     "regroovable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retreadable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "runFlat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shoulderType" TEXT,
ADD COLUMN     "sidewallStyle" TEXT,
ADD COLUMN     "smartWay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "threePMSF" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "treadType" TEXT,
ADD COLUMN     "utqg" TEXT;

-- AlterTable
ALTER TABLE "InventorySnapshot" ADD COLUMN     "incomingEta" TIMESTAMP(3),
ADD COLUMN     "incomingQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reservedQty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SpecProposal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldsJson" JSONB NOT NULL,
    "status" "SpecProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "SpecProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecProposal_productId_key" ON "SpecProposal"("productId");

-- CreateIndex
CREATE INDEX "SpecProposal_status_idx" ON "SpecProposal"("status");

-- CreateIndex
CREATE INDEX "TireSpec_position_idx" ON "TireSpec"("position");

-- CreateIndex
CREATE INDEX "TireSpec_treadType_idx" ON "TireSpec"("treadType");

-- AddForeignKey
ALTER TABLE "SpecProposal" ADD CONSTRAINT "SpecProposal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecProposal" ADD CONSTRAINT "SpecProposal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

