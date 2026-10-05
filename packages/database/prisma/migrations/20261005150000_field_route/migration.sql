-- CreateTable
CREATE TABLE "FieldRoute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stopIds" TEXT[],
    "miles" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldRoute_userId_key" ON "FieldRoute"("userId");

-- AddForeignKey
ALTER TABLE "FieldRoute" ADD CONSTRAINT "FieldRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
