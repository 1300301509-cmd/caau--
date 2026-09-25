ALTER TABLE "AgentSession"
  ADD COLUMN "contextSummary" VARCHAR(2000) NOT NULL DEFAULT '',
  ADD COLUMN "summarizedThroughSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentSession"
  ADD CONSTRAINT agent_session_summary_sequence CHECK ("summarizedThroughSequence" >= 0);

CREATE TABLE "AgentMemory" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceSessionId" UUID REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "content" VARCHAR(300) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT agent_memory_status CHECK ("status" IN ('ACTIVE', 'DELETED')),
  CONSTRAINT agent_memory_revision CHECK ("revision" > 0),
  CONSTRAINT agent_memory_content CHECK ("status" = 'DELETED' OR length(trim("content")) > 0),
  CONSTRAINT agent_memory_deleted CHECK (("status" = 'ACTIVE' AND "deletedAt" IS NULL) OR ("status" = 'DELETED' AND "deletedAt" IS NOT NULL))
);
CREATE INDEX "AgentMemory_ownerId_status_updatedAt_idx"
  ON "AgentMemory"("ownerId", "status", "updatedAt");

DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentMemory" TO %I', runtime_role);
END $$;
