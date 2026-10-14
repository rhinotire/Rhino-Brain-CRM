-- Public account-setup uploads have no CRM user
ALTER TABLE "CustomerDocument" ALTER COLUMN "uploadedById" DROP NOT NULL;
