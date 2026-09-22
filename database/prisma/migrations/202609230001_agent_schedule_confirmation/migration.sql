ALTER TABLE "AgentTask" DROP CONSTRAINT agent_task_step;
ALTER TABLE "AgentTask" ADD CONSTRAINT agent_task_step CHECK (step IN ('LOCATE_EVENT','LOCATE_MATCH','WAITING_PARAMETERS','PREVIEW_READY','STALE','FAILED','EXECUTED','CANCELLED'));

CREATE TABLE "AgentConfirmationTicket" (
  "id" UUID PRIMARY KEY,
  "taskId" UUID NOT NULL REFERENCES "AgentTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorDisplayName" VARCHAR(80) NOT NULL,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventName" VARCHAR(120) NOT NULL,
  "matchId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "venue" VARCHAR(80) NOT NULL,
  "expectedRevision" INTEGER NOT NULL,
  "parameterSummary" JSONB NOT NULL,
  "parameterHash" CHAR(64) NOT NULL,
  "toolName" VARCHAR(80) NOT NULL,
  "toolVersion" VARCHAR(16) NOT NULL,
  "commandId" UUID NOT NULL UNIQUE,
  "state" VARCHAR(16) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_confirmation_ticket_revision CHECK ("expectedRevision" > 0),
  CONSTRAINT agent_confirmation_ticket_summary CHECK (jsonb_typeof("parameterSummary") = 'object'),
  CONSTRAINT agent_confirmation_ticket_hash CHECK ("parameterHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_confirmation_ticket_state CHECK (state IN ('PENDING','EXECUTED','CANCELLED')),
  CONSTRAINT agent_confirmation_ticket_consumed CHECK ((state='PENDING' AND "consumedAt" IS NULL) OR (state IN ('EXECUTED','CANCELLED') AND "consumedAt" IS NOT NULL))
);
CREATE INDEX "AgentConfirmationTicket_taskId_createdAt_idx" ON "AgentConfirmationTicket"("taskId", "createdAt");
CREATE INDEX "AgentConfirmationTicket_ownerId_state_expiresAt_idx" ON "AgentConfirmationTicket"("ownerId", state, "expiresAt");

CREATE TABLE "AgentCommandReceipt" (
  "id" UUID PRIMARY KEY,
  "ticketId" UUID NOT NULL UNIQUE REFERENCES "AgentConfirmationTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "commandId" UUID NOT NULL UNIQUE,
  "ownerId" UUID NOT NULL REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "matchId" UUID NOT NULL,
  "parameterHash" CHAR(64) NOT NULL,
  result JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_command_receipt_hash CHECK ("parameterHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_command_receipt_result CHECK (jsonb_typeof(result) = 'object')
);
CREATE INDEX "AgentCommandReceipt_ownerId_createdAt_idx" ON "AgentCommandReceipt"("ownerId", "createdAt");
CREATE INDEX "AgentCommandReceipt_eventId_createdAt_idx" ON "AgentCommandReceipt"("eventId", "createdAt");

CREATE FUNCTION protect_agent_confirmation_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW."taskId"<>OLD."taskId" OR NEW."ownerId"<>OLD."ownerId" OR NEW."actorDisplayName"<>OLD."actorDisplayName" OR
     NEW."eventId"<>OLD."eventId" OR NEW."eventName"<>OLD."eventName" OR NEW."matchId"<>OLD."matchId" OR NEW."startAt"<>OLD."startAt" OR
     NEW.venue<>OLD.venue OR NEW."expectedRevision"<>OLD."expectedRevision" OR NEW."parameterSummary"<>OLD."parameterSummary" OR
     NEW."parameterHash"<>OLD."parameterHash" OR NEW."toolName"<>OLD."toolName" OR NEW."toolVersion"<>OLD."toolVersion" OR
     NEW."commandId"<>OLD."commandId" OR NEW."expiresAt"<>OLD."expiresAt" OR NEW."createdAt"<>OLD."createdAt" THEN
    RAISE EXCEPTION 'Agent confirmation binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state<>'PENDING' OR NEW.state NOT IN ('EXECUTED','CANCELLED') OR NEW."consumedAt" IS NULL THEN
    RAISE EXCEPTION 'Invalid agent confirmation transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_confirmation_ticket_transition BEFORE UPDATE ON "AgentConfirmationTicket" FOR EACH ROW EXECUTE FUNCTION protect_agent_confirmation_ticket();
CREATE TRIGGER immutable_agent_confirmation_ticket_delete BEFORE DELETE OR TRUNCATE ON "AgentConfirmationTicket" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE TRIGGER immutable_agent_command_receipt BEFORE UPDATE OR DELETE OR TRUNCATE ON "AgentCommandReceipt" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

DO $$ DECLARE runtime_role text; BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentConfirmationTicket" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "AgentCommandReceipt" TO %I', runtime_role);
END $$;
