-- CreateTable
CREATE TABLE "TireSpec" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "width" INTEGER,
    "aspectRatio" INTEGER,
    "rimDiameter" DECIMAL(4,1),
    "construction" TEXT,
    "plyRating" INTEGER,
    "loadRange" TEXT,
    "loadIndex" TEXT,
    "speedRating" TEXT,
    "position" TEXT,
    "application" TEXT,
    "treadDepth32nds" DECIMAL(4,1),
    "maxLoadLbs" INTEGER,
    "maxPressurePsi" INTEGER,
    "rimWidthRange" TEXT,
    "overallDiameterIn" DECIMAL(5,2),
    "sectionWidthIn" DECIMAL(5,2),

    CONSTRAINT "TireSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelSpec" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "diameterIn" DECIMAL(4,1),
    "widthIn" DECIMAL(4,2),
    "boltPattern" TEXT,
    "lugCount" INTEGER,
    "centerBoreMm" DECIMAL(6,2),
    "offsetMm" INTEGER,
    "backspacingIn" DECIMAL(4,2),
    "loadRatingLbs" INTEGER,
    "finish" TEXT,
    "material" TEXT,

    CONSTRAINT "WheelSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartSpec" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partType" TEXT,
    "capacity" TEXT,
    "dimensions" TEXT,
    "material" TEXT,
    "mountingType" TEXT,
    "compatibilityNotes" TEXT,
    "certGrade" TEXT,

    CONSTRAINT "PartSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TireSpec_productId_key" ON "TireSpec"("productId");

-- CreateIndex
CREATE INDEX "TireSpec_loadRange_idx" ON "TireSpec"("loadRange");

-- CreateIndex
CREATE UNIQUE INDEX "WheelSpec_productId_key" ON "WheelSpec"("productId");

-- CreateIndex
CREATE INDEX "WheelSpec_boltPattern_idx" ON "WheelSpec"("boltPattern");

-- CreateIndex
CREATE UNIQUE INDEX "PartSpec_productId_key" ON "PartSpec"("productId");

-- AddForeignKey
ALTER TABLE "TireSpec" ADD CONSTRAINT "TireSpec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSpec" ADD CONSTRAINT "WheelSpec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartSpec" ADD CONSTRAINT "PartSpec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

