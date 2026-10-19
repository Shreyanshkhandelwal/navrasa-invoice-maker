-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveConnection_businessId_key" ON "GoogleDriveConnection"("businessId");

-- CreateIndex
CREATE INDEX "GoogleDriveConnection_businessId_idx" ON "GoogleDriveConnection"("businessId");

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
