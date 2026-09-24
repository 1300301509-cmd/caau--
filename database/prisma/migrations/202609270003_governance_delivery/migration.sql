ALTER TABLE "GovernanceAlert"
 ADD COLUMN "deliveryState" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
 ADD COLUMN "notifiedAt" TIMESTAMPTZ(3),
 ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AuditRecord_occurredAt_id_idx" ON "AuditRecord"("occurredAt", "id");
