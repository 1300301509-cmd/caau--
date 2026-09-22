CREATE TABLE "AgentSession" (
  "id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "summary" VARCHAR(2000) NOT NULL DEFAULT '',
  "currentEventId" UUID REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "currentMatchId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgentSession_ownerId_updatedAt_idx" ON "AgentSession"("ownerId", "updatedAt");

CREATE TABLE "AgentTurn" (
  "id" UUID PRIMARY KEY,
  "sessionId" UUID NOT NULL REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" VARCHAR(16) NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "structured" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_turn_role CHECK (role IN ('USER', 'ASSISTANT')),
  CONSTRAINT agent_turn_structured CHECK (jsonb_typeof(structured) = 'object')
);
CREATE INDEX "AgentTurn_sessionId_createdAt_idx" ON "AgentTurn"("sessionId", "createdAt");

CREATE TABLE "AgentTask" (
  "id" UUID PRIMARY KEY,
  "sessionId" UUID NOT NULL REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "goal" VARCHAR(500) NOT NULL,
  "step" VARCHAR(32) NOT NULL,
  "eventId" UUID REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "matchId" UUID,
  "baselineRevision" INTEGER,
  "preview" JSONB,
  "previewExpiresAt" TIMESTAMPTZ(3),
  "checkpointThreadId" UUID NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_task_step CHECK (step IN ('LOCATE_EVENT','LOCATE_MATCH','PREVIEW_READY','STALE','FAILED')),
  CONSTRAINT agent_task_revision CHECK ("baselineRevision" IS NULL OR "baselineRevision" > 0),
  CONSTRAINT agent_task_preview CHECK ("preview" IS NULL OR jsonb_typeof("preview") = 'object')
);
CREATE INDEX "AgentTask_ownerId_updatedAt_idx" ON "AgentTask"("ownerId", "updatedAt");
CREATE INDEX "AgentTask_sessionId_updatedAt_idx" ON "AgentTask"("sessionId", "updatedAt");

CREATE SCHEMA caau_agent;
CREATE TABLE caau_agent.checkpoint_migrations (v INTEGER PRIMARY KEY);
INSERT INTO caau_agent.checkpoint_migrations(v) VALUES (0),(1),(2),(3),(4);
CREATE TABLE caau_agent.checkpoints (
  thread_id TEXT NOT NULL, checkpoint_ns TEXT NOT NULL DEFAULT '', checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT, type TEXT, checkpoint JSONB NOT NULL, metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
CREATE TABLE caau_agent.checkpoint_blobs (
  thread_id TEXT NOT NULL, checkpoint_ns TEXT NOT NULL DEFAULT '', channel TEXT NOT NULL,
  version TEXT NOT NULL, type TEXT NOT NULL, blob BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
CREATE TABLE caau_agent.checkpoint_writes (
  thread_id TEXT NOT NULL, checkpoint_ns TEXT NOT NULL DEFAULT '', checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL, idx INTEGER NOT NULL, channel TEXT NOT NULL, type TEXT, blob BYTEA NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

DO $$ DECLARE runtime_role text; BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentSession", "AgentTask" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "AgentTurn" TO %I', runtime_role);
 EXECUTE format('GRANT USAGE ON SCHEMA caau_agent TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA caau_agent TO %I', runtime_role);
END $$;
