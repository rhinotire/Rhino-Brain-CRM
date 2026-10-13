-- Employee identity fields (filled by the license scan or typed)
ALTER TABLE "Employee" ADD COLUMN "dob" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN "city" TEXT;
ALTER TABLE "Employee" ADD COLUMN "state" TEXT;
ALTER TABLE "Employee" ADD COLUMN "zip" TEXT;
ALTER TABLE "Employee" ADD COLUMN "licenseNumber" TEXT;
