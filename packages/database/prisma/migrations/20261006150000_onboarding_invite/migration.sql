-- CreateTable
CREATE TABLE "OnboardingInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingInvite_token_key" ON "OnboardingInvite"("token");

-- CreateIndex
CREATE INDEX "OnboardingInvite_employeeId_idx" ON "OnboardingInvite"("employeeId");

-- AddForeignKey
ALTER TABLE "OnboardingInvite" ADD CONSTRAINT "OnboardingInvite_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
