CREATE TABLE "CompetitorLookup" (
    "id" TEXT NOT NULL,
    "sizeKey" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "CompetitorLookup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompetitorLookup_status_idx" ON "CompetitorLookup"("status");
