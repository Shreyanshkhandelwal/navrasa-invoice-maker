CREATE INDEX "Invoice_businessId_invoiceStatus_invoiceType_invoiceDate_idx"
ON "Invoice"("businessId", "invoiceStatus", "invoiceType", "invoiceDate");
