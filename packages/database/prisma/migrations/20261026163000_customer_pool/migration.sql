-- 公海 (customer pool): pool clock fields on Customer + the PoolEvent audit table.
--
-- Additive only. No DROP, no data change: three nullable columns, one boolean with a
-- default, one new table, three indexes, two foreign keys on the new table.
--
-- NOTE: `prisma migrate diff` also wanted to drop and re-add
-- CustomerDocument_uploadedById_fkey and EmployeeDocument_uploadedById_fkey to change
-- their delete rule from RESTRICT to SET NULL. That is PRE-EXISTING drift between
-- schema.prisma and the live database and has nothing to do with the pool, so it is
-- deliberately excluded here (see the ledger's Task 1 ruling). Bundling it would hide
-- what this migration did and would tie a referential-integrity change to a pool rollback.

-- CreateEnum
CREATE TYPE "PoolEventKind" AS ENUM ('CLAIM', 'RECYCLE', 'MANUAL_UNASSIGN', 'EXEMPT', 'UNEXEMPT');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "lastSaleAt" TIMESTAMP(3),
ADD COLUMN     "poolExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "poolWarnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PoolEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "repId" TEXT,
    "kind" "PoolEventKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "PoolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PoolEvent_customerId_at_idx" ON "PoolEvent"("customerId", "at");

-- CreateIndex
CREATE INDEX "PoolEvent_repId_at_idx" ON "PoolEvent"("repId", "at");

-- CreateIndex
CREATE INDEX "Customer_poolWarnedAt_idx" ON "Customer"("poolWarnedAt");

-- AddForeignKey
ALTER TABLE "PoolEvent" ADD CONSTRAINT "PoolEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolEvent" ADD CONSTRAINT "PoolEvent_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
