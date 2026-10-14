-- Customer taxId + online account-application invites
ALTER TABLE "Customer" ADD COLUMN "taxId" TEXT;

CREATE TABLE "AccountSetupInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    CONSTRAINT "AccountSetupInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountSetupInvite_token_key" ON "AccountSetupInvite"("token");
CREATE INDEX "AccountSetupInvite_customerId_idx" ON "AccountSetupInvite"("customerId");
ALTER TABLE "AccountSetupInvite" ADD CONSTRAINT "AccountSetupInvite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
