-- AlterTable
ALTER TABLE "AuditRecord" ADD COLUMN     "commandId" UUID,
ADD COLUMN     "eventId" UUID,
ADD COLUMN     "result" VARCHAR(24),
ADD COLUMN     "traceId" VARCHAR(32);

-- CreateTable
CREATE TABLE "AiCostAssignment" (
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCostAssignment_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AiUsageCall" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "organizationId" UUID,
    "requestId" UUID NOT NULL,
    "traceId" VARCHAR(32),
    "sessionId" UUID,
    "taskId" UUID,
    "mode" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(160) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "phase" VARCHAR(32) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'RESERVED',
    "usageStatus" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "reservedTokens" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "elapsedMs" INTEGER,
    "errorCategory" VARCHAR(32),
    "providerRequestId" VARCHAR(200),
    "priceId" UUID,
    "estimatedMicros" BIGINT,
    "currency" VARCHAR(8),
    "resolvedReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AiUsageCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQuotaPolicy" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "subjectId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "dailyTokens" INTEGER,
    "monthlyTokens" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQuotaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQuotaBucket" (
    "id" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "subjectId" UUID NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "used" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQuotaBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelPrice" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(160) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "inputMicrosPerMillion" BIGINT NOT NULL,
    "outputMicrosPerMillion" BIGINT NOT NULL,
    "cachedMicrosPerMillion" BIGINT,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSupplierBill" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(160) NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "from" TIMESTAMPTZ(3) NOT NULL,
    "to" TIMESTAMPTZ(3) NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "note" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSupplierBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceAlert" (
    "id" UUID NOT NULL,
    "fingerprint" VARCHAR(200) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "acknowledgedBy" UUID,
    "ownerId" UUID,
    "note" VARCHAR(300),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMPTZ(3),

    CONSTRAINT "GovernanceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageCall_actorId_createdAt_id_idx" ON "AiUsageCall"("actorId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AiUsageCall_organizationId_createdAt_id_idx" ON "AiUsageCall"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AiUsageCall_createdAt_id_idx" ON "AiUsageCall"("createdAt", "id");

-- CreateIndex
CREATE INDEX "AiUsageCall_requestId_idx" ON "AiUsageCall"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AiQuotaPolicy_scope_subjectId_key" ON "AiQuotaPolicy"("scope", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelPrice_provider_model_effectiveAt_key" ON "AiModelPrice"("provider", "model", "effectiveAt");

-- CreateIndex
CREATE INDEX "GovernanceAlert_state_lastSeenAt_id_idx" ON "GovernanceAlert"("state", "lastSeenAt", "id");

-- CreateIndex
CREATE INDEX "AuditRecord_actorId_occurredAt_id_idx" ON "AuditRecord"("actorId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AuditRecord_action_occurredAt_id_idx" ON "AuditRecord"("action", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AuditRecord_eventId_occurredAt_id_idx" ON "AuditRecord"("eventId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "AuditRecord_requestId_idx" ON "AuditRecord"("requestId");


-- Runtime may append prices/bills; no general deletion authority.
DO $$ DECLARE r text; BEGIN
 r := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF r IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AiCostAssignment", "AiUsageCall", "AiQuotaPolicy", "AiQuotaBucket", "GovernanceAlert" TO %I', r);
 EXECUTE format('GRANT SELECT, INSERT ON "AiModelPrice", "AiSupplierBill" TO %I', r);
END $$;
ALTER TABLE "AiQuotaBucket" ADD CONSTRAINT "AiQuotaBucket_nonnegative" CHECK (used >= 0 AND reserved >= 0);
ALTER TABLE "AiQuotaPolicy" ADD CONSTRAINT "AiQuotaPolicy_valid" CHECK (scope IN ('ACCOUNT','ORGANIZATION') AND ("dailyTokens" IS NULL OR "dailyTokens" >= 0) AND ("monthlyTokens" IS NULL OR "monthlyTokens" >= 0));
