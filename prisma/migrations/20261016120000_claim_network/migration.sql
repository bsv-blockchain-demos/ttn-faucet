-- Multi-network: record which network each payout was made on. Existing rows were all Teratestnet.
ALTER TABLE "Claim" ADD COLUMN "network" TEXT NOT NULL DEFAULT 'ttn';

-- CreateIndex
CREATE INDEX "Claim_network_status_idx" ON "Claim"("network", "status");
