-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient" TEXT NOT NULL,
    "amountSats" INTEGER NOT NULL,
    "txid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ipHash" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "idempotencyKey" TEXT,
    "ef" TEXT
);

-- CreateTable
CREATE TABLE "RateEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hashedKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Claim_idempotencyKey_key" ON "Claim"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Claim_ipHash_createdAt_idx" ON "Claim"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "RateEvent_subject_createdAt_idx" ON "RateEvent"("subject", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");
