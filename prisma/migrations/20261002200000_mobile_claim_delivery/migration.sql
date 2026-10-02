-- AlterTable
ALTER TABLE "Claim" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "Claim" ADD COLUMN "remittance" TEXT;

-- CreateIndex
CREATE INDEX "Claim_recipient_createdAt_idx" ON "Claim"("recipient", "createdAt");

