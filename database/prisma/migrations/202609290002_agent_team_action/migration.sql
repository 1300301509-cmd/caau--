CREATE TABLE "AgentTeamAction" (
  "id" UUID NOT NULL PRIMARY KEY,
  "sessionId" UUID NOT NULL REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "state" VARCHAR(24) NOT NULL DEFAULT 'COLLECTING',
  "mode" VARCHAR(8) NOT NULL DEFAULT 'REAL',
  "profiles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "missing" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "teamIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_team_action_state CHECK ("state" IN ('COLLECTING', 'PREVIEW_READY', 'EXECUTED', 'CANCELLED')),
  CONSTRAINT agent_team_action_mode CHECK ("mode" IN ('REAL', 'TEST')),
  CONSTRAINT agent_team_action_revision CHECK ("revision" > 0),
  CONSTRAINT agent_team_action_profiles CHECK (jsonb_typeof("profiles") = 'array'),
  CONSTRAINT agent_team_action_missing CHECK (jsonb_typeof("missing") = 'array'),
  CONSTRAINT agent_team_action_ids CHECK (jsonb_typeof("teamIds") = 'array')
);
CREATE INDEX "AgentTeamAction_sessionId_updatedAt_idx" ON "AgentTeamAction"("sessionId", "updatedAt");
CREATE INDEX "AgentTeamAction_ownerId_eventId_idx" ON "AgentTeamAction"("ownerId", "eventId");

DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentTeamAction" TO %I', runtime_role);
END $$;
