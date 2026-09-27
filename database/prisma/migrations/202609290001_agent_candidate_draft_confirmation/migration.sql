CREATE TABLE "AgentCandidateSaveTicket" (
  "id" UUID PRIMARY KEY,
  "candidateId" UUID NOT NULL REFERENCES "AgentScheduleCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "planningId" UUID NOT NULL REFERENCES "AgentPlanningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "planningRevision" INTEGER NOT NULL,
  "baselineRevision" INTEGER NOT NULL,
  "candidateHash" CHAR(64) NOT NULL,
  "toolName" VARCHAR(80) NOT NULL,
  "toolVersion" VARCHAR(16) NOT NULL,
  "commandId" UUID NOT NULL UNIQUE,
  "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_candidate_save_revision CHECK ("planningRevision" > 0 AND "baselineRevision" >= 0),
  CONSTRAINT agent_candidate_save_hash CHECK ("candidateHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_candidate_save_state CHECK ("state" IN ('PENDING','EXECUTED','CANCELLED')),
  CONSTRAINT agent_candidate_save_consumed CHECK (("state"='PENDING' AND "consumedAt" IS NULL) OR ("state" IN ('EXECUTED','CANCELLED') AND "consumedAt" IS NOT NULL))
);
CREATE INDEX "AgentCandidateSaveTicket_candidateId_createdAt_idx" ON "AgentCandidateSaveTicket"("candidateId", "createdAt");
CREATE INDEX "AgentCandidateSaveTicket_ownerId_state_expiresAt_idx" ON "AgentCandidateSaveTicket"("ownerId", "state", "expiresAt");

CREATE TABLE "AgentCandidateSaveReceipt" (
  "id" UUID PRIMARY KEY,
  "ticketId" UUID NOT NULL UNIQUE REFERENCES "AgentCandidateSaveTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "commandId" UUID NOT NULL UNIQUE,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "candidateHash" CHAR(64) NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_candidate_save_receipt_hash CHECK ("candidateHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_candidate_save_receipt_result CHECK (jsonb_typeof("result") = 'object')
);
CREATE INDEX "AgentCandidateSaveReceipt_ownerId_createdAt_idx" ON "AgentCandidateSaveReceipt"("ownerId", "createdAt");
CREATE INDEX "AgentCandidateSaveReceipt_eventId_createdAt_idx" ON "AgentCandidateSaveReceipt"("eventId", "createdAt");

CREATE FUNCTION protect_agent_candidate_save_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id"<>OLD."id" OR NEW."candidateId"<>OLD."candidateId" OR NEW."ownerId"<>OLD."ownerId" OR
     NEW."eventId"<>OLD."eventId" OR NEW."planningId"<>OLD."planningId" OR NEW."planningRevision"<>OLD."planningRevision" OR
     NEW."baselineRevision"<>OLD."baselineRevision" OR NEW."candidateHash"<>OLD."candidateHash" OR
     NEW."toolName"<>OLD."toolName" OR NEW."toolVersion"<>OLD."toolVersion" OR NEW."commandId"<>OLD."commandId" OR
     NEW."expiresAt"<>OLD."expiresAt" OR NEW."createdAt"<>OLD."createdAt" THEN
    RAISE EXCEPTION 'Candidate save binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD."state"<>'PENDING' OR NEW."state" NOT IN ('EXECUTED','CANCELLED') OR NEW."consumedAt" IS NULL THEN
    RAISE EXCEPTION 'Invalid candidate save transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_candidate_save_transition BEFORE UPDATE ON "AgentCandidateSaveTicket" FOR EACH ROW EXECUTE FUNCTION protect_agent_candidate_save_ticket();
CREATE TRIGGER immutable_agent_candidate_save_ticket_delete BEFORE DELETE OR TRUNCATE ON "AgentCandidateSaveTicket" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE TRIGGER immutable_agent_candidate_save_receipt BEFORE UPDATE OR DELETE OR TRUNCATE ON "AgentCandidateSaveReceipt" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentCandidateSaveTicket" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT ON "AgentCandidateSaveReceipt" TO %I', runtime_role);
END $$;
