-- CreateEnum
CREATE TYPE "ProspectPool" AS ENUM ('A_BUYER', 'B_PROJECT', 'C_CHANNEL', 'D_EXCLUDED');

-- CreateEnum
CREATE TYPE "ProspectConfidence" AS ENUM ('H', 'M', 'L');

-- CreateEnum
CREATE TYPE "ProspectProductLine" AS ENUM ('P1_TRAILER_TIRE', 'P2_TRAILER_WHEEL', 'P3_PCR', 'P4_TBR', 'P5_OTR');

-- CreateEnum
CREATE TYPE "ExclusionKind" AS ENUM ('EXISTING_CUSTOMER', 'AGENT', 'COMPETITOR', 'OPTED_OUT', 'RISK');

-- CreateEnum
CREATE TYPE "ProspectSourceKind" AS ENUM ('SEED', 'REVIVAL', 'GOOGLE_PLACES', 'WEB_SCRAPE', 'CUSTOMS');

-- AlterEnum
ALTER TYPE "CustomerSource" ADD VALUE 'PROSPECTING';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "confidence" "ProspectConfidence",
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'US',
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "enrichment" JSONB,
ADD COLUMN     "pool" "ProspectPool",
ADD COLUMN     "productLine" "ProspectProductLine",
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreReasons" JSONB,
ADD COLUMN     "sourceRunId" TEXT;

-- CreateTable
CREATE TABLE "ExclusionList" (
    "id" TEXT NOT NULL,
    "kind" "ExclusionKind" NOT NULL,
    "companyName" TEXT NOT NULL,
    "domain" TEXT,
    "phone" TEXT,
    "reason" TEXT,
    "reviewAt" TIMESTAMP(3),
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExclusionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL,
    "source" "ProspectSourceKind" NOT NULL,
    "params" JSONB NOT NULL,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "newLeadCount" INTEGER NOT NULL DEFAULT 0,
    "dupCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "apiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExclusionList_domain_idx" ON "ExclusionList"("domain");

-- CreateIndex
CREATE INDEX "ExclusionList_phone_idx" ON "ExclusionList"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_dedupeKey_key" ON "Lead"("dedupeKey");

-- CreateIndex
CREATE INDEX "Lead_pool_reviewedAt_idx" ON "Lead"("pool", "reviewedAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "SourceRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

