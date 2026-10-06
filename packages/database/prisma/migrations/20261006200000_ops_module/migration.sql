-- CreateTable
CREATE TABLE "OpsItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "asset" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "recurrenceMonths" INTEGER,
    "remindDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastRenewedAt" TIMESTAMP(3),
    "lastRemindedOn" TIMESTAMP(3),
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairTicket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "photoPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignee" TEXT,
    "reportedById" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "RepairTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsItem_locationId_status_dueDate_idx" ON "OpsItem"("locationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "RepairTicket_locationId_status_idx" ON "RepairTicket"("locationId", "status");

-- AddForeignKey
ALTER TABLE "OpsItem" ADD CONSTRAINT "OpsItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
