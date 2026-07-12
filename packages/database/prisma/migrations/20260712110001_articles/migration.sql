-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL DEFAULT 'RHINO',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'Rhino Tire USA Wholesale Team',
    "reviewedBy" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_brandKey_published_publishedAt_idx" ON "Article"("brandKey", "published", "publishedAt");

