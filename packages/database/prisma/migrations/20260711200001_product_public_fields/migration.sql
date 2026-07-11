-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('INTERNAL', 'PUBLIC', 'DEALER_ONLY');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "featuresJson" JSONB,
ADD COLUMN     "msrp" DECIMAL(10,2),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "pattern" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "warrantySummary" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_visibility_idx" ON "Product"("visibility");

