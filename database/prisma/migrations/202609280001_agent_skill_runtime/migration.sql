CREATE TABLE "AgentSkillVersion" (
  "id" UUID PRIMARY KEY,
  "skillKey" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL,
  "instructions" VARCHAR(8000) NOT NULL,
  "state" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "createdBy" UUID NOT NULL,
  "activatedBy" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMPTZ(3),
  CONSTRAINT agent_skill_version_positive CHECK ("version" > 0),
  CONSTRAINT agent_skill_state CHECK ("state" IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  CONSTRAINT agent_skill_instructions CHECK (length(trim("instructions")) > 0)
);
CREATE UNIQUE INDEX "AgentSkillVersion_skillKey_version_key"
  ON "AgentSkillVersion"("skillKey", "version");
CREATE INDEX "AgentSkillVersion_skillKey_state_idx"
  ON "AgentSkillVersion"("skillKey", "state");
CREATE UNIQUE INDEX "AgentSkillVersion_one_active_per_key"
  ON "AgentSkillVersion"("skillKey") WHERE "state" = 'ACTIVE';

CREATE TABLE "AgentPendingQuestion" (
  "sessionId" UUID PRIMARY KEY REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" VARCHAR(32) NOT NULL,
  "planningId" UUID NOT NULL REFERENCES "AgentPlanningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "planningRevision" INTEGER NOT NULL,
  "question" VARCHAR(500) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_pending_question_kind CHECK ("kind" IN ('ROUND_ROBIN', 'START_DATE')),
  CONSTRAINT agent_pending_question_revision CHECK ("planningRevision" > 0),
  CONSTRAINT agent_pending_question_text CHECK (length(trim("question")) > 0)
);
CREATE INDEX "AgentPendingQuestion_planningId_idx"
  ON "AgentPendingQuestion"("planningId");

DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentSkillVersion" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentPendingQuestion" TO %I', runtime_role);
END $$;
