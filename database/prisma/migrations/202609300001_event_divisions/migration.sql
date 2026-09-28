-- Existing event teams intentionally retain NULL divisionId until explicitly assigned.
CREATE TABLE "EventDivision" (
  "id" UUID NOT NULL PRIMARY KEY,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT event_division_name CHECK (length(btrim("name")) > 0),
  CONSTRAINT event_division_revision CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "EventDivision_eventId_name_key" ON "EventDivision"("eventId", "name");
CREATE UNIQUE INDEX "EventDivision_id_eventId_key" ON "EventDivision"("id", "eventId");
CREATE INDEX "EventDivision_eventId_active_idx" ON "EventDivision"("eventId", "active");

CREATE TABLE "EventDivisionVersion" (
  "id" UUID NOT NULL PRIMARY KEY,
  "divisionId" UUID NOT NULL REFERENCES "EventDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EventDivisionVersion_divisionId_revision_key" ON "EventDivisionVersion"("divisionId", "revision");
CREATE TRIGGER immutable_event_division_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventDivisionVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

ALTER TABLE "EventTeam" ADD COLUMN "divisionId" UUID;
CREATE INDEX "EventTeam_divisionId_eventId_idx" ON "EventTeam"("divisionId", "eventId");
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_divisionId_eventId_fkey" FOREIGN KEY ("divisionId", "eventId") REFERENCES "EventDivision"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventTeamVersion" ADD COLUMN "divisionId" UUID;
ALTER TABLE "AgentTeamAction" ADD COLUMN "divisionId" UUID;
ALTER TABLE "AgentTeamAction" ADD COLUMN "divisionRevision" INTEGER;

CREATE FUNCTION protect_event_division_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW."eventId"<>OLD."eventId" OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'Invalid event division identity or revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_division_identity BEFORE UPDATE ON "EventDivision" FOR EACH ROW EXECUTE FUNCTION protect_event_division_identity();

-- Historical rows may be NULL; newly attached teams must have a real division.
CREATE FUNCTION require_event_team_division() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."divisionId" IS NULL THEN
    RAISE EXCEPTION 'Event team division is required' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."divisionId" IS NULL AND OLD."divisionId" IS NOT NULL THEN
    RAISE EXCEPTION 'Event team division is required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_team_division_required BEFORE INSERT OR UPDATE OF "divisionId" ON "EventTeam" FOR EACH ROW EXECUTE FUNCTION require_event_team_division();

DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "EventDivision" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT ON "EventDivisionVersion" TO %I', runtime_role);
END $$;
