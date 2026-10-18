/*
  Warnings:

  - A unique constraint covering the columns `[businessId,invoiceNo]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Made the column `businessId` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `businessId` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `businessId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Invoice_invoiceNo_key";

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "businessId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "businessId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "businessId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_invoiceNo_key" ON "Invoice"("businessId", "invoiceNo");
