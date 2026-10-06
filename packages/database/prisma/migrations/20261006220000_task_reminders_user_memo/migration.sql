-- Task due-reminder dedupe + personal memo pad
ALTER TABLE "Task" ADD COLUMN "lastRemindedOn" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "memo" TEXT;
