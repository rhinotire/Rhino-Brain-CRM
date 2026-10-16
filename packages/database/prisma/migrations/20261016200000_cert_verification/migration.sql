-- Resale-certificate verification trail + recheck reminders
ALTER TABLE "CustomerDocument" ADD COLUMN "verifyStatus" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "CustomerDocument" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "verifyNotes" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "evidencePath" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "lastRemindedOn" TIMESTAMP(3);
