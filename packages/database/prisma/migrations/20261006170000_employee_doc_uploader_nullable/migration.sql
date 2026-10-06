-- AlterColumn: public onboarding uploads have no CRM user
ALTER TABLE "EmployeeDocument" ALTER COLUMN "uploadedById" DROP NOT NULL;
