CREATE TABLE "OwnerSmsLog" (
    "id" TEXT NOT NULL,
    "phoneFrom" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnerSmsLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OwnerSmsLog_phoneFrom_createdAt_idx" ON "OwnerSmsLog"("phoneFrom", "createdAt");
