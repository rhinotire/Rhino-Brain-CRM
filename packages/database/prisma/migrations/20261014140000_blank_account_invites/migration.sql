-- Blank account invites: link first, customer created on submit
ALTER TABLE "AccountSetupInvite" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "AccountSetupInvite" ADD COLUMN "locationId" TEXT;
ALTER TABLE "AccountSetupInvite" ADD COLUMN "createdById" TEXT;
