-- Separate immutable previews; never reference or mutate EventScheduleVersion.
CREATE TABLE "AgentScheduleCandidate" (
  "id" UUID NOT NULL,
  "planningId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "planningRevision" INTEGER NOT NULL,
  "baselineRevision" INTEGER NOT NULL,
  "format" "ScheduleFormat" NOT NULL,
  "config" JSONB NOT NULL,
  "configSource" VARCHAR(32) NOT NULL,
  "teamSnapshot" JSONB NOT NULL,
  "baselineSnapshot" JSONB NOT NULL,
  "fixedMatchIds" JSONB NOT NULL,
  "matches" JSONB NOT NULL,
  "issues" JSONB NOT NULL,
  "preferences" JSONB NOT NULL,
  "outcome" VARCHAR(24) NOT NULL,
  "explored" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentScheduleCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentScheduleCandidate_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "AgentPlanningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AgentScheduleCandidate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AgentScheduleCandidate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AgentScheduleCandidate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AgentScheduleCandidate_planningId_createdAt_idx" ON "AgentScheduleCandidate"("planningId", "createdAt");
CREATE INDEX "AgentScheduleCandidate_ownerId_createdAt_idx" ON "AgentScheduleCandidate"("ownerId", "createdAt");
DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT ON "AgentScheduleCandidate" TO %I', runtime_role);
END $$;
