CREATE TABLE "EventTeamRoster" (
  "eventTeamId" UUID NOT NULL,
  "members" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTeamRoster_pkey" PRIMARY KEY ("eventTeamId"),
  CONSTRAINT "EventTeamRoster_eventTeamId_fkey" FOREIGN KEY ("eventTeamId") REFERENCES "EventTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_team_roster_members CHECK (jsonb_typeof("members")='array'),
  CONSTRAINT event_team_roster_revision CHECK ("revision" > 0)
);

CREATE TABLE "EventTeamRosterVersion" (
  "id" UUID NOT NULL,
  "rosterId" UUID NOT NULL,
  "members" JSONB NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTeamRosterVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventTeamRosterVersion_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "EventTeamRoster"("eventTeamId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_team_roster_version_members CHECK (jsonb_typeof("members")='array')
);

CREATE TABLE "EventMatchStaff" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "scheduleRevision" INTEGER NOT NULL,
  "matchId" UUID NOT NULL,
  "staff" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventMatchStaff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventMatchStaff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_match_staff_values CHECK ("scheduleRevision" > 0 AND "revision" > 0 AND jsonb_typeof("staff")='array')
);

CREATE TABLE "EventMatchStaffVersion" (
  "id" UUID NOT NULL,
  "matchStaffId" UUID NOT NULL,
  "staff" JSONB NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventMatchStaffVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventMatchStaffVersion_matchStaffId_fkey" FOREIGN KEY ("matchStaffId") REFERENCES "EventMatchStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_match_staff_version_values CHECK ("revision" > 0 AND jsonb_typeof("staff")='array')
);

CREATE UNIQUE INDEX "EventTeamRosterVersion_rosterId_revision_key" ON "EventTeamRosterVersion"("rosterId", "revision");
CREATE UNIQUE INDEX "EventMatchStaff_eventId_scheduleRevision_matchId_key" ON "EventMatchStaff"("eventId", "scheduleRevision", "matchId");
CREATE INDEX "EventMatchStaff_eventId_scheduleRevision_idx" ON "EventMatchStaff"("eventId", "scheduleRevision");
CREATE UNIQUE INDEX "EventMatchStaffVersion_matchStaffId_revision_key" ON "EventMatchStaffVersion"("matchStaffId", "revision");

DO $$
DECLARE runtime_role text;
BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "EventTeamRoster", "EventMatchStaff" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "EventTeamRosterVersion", "EventMatchStaffVersion" TO %I', runtime_role);
END $$;

CREATE TRIGGER immutable_event_team_roster_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventTeamRosterVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE TRIGGER immutable_event_match_staff_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventMatchStaffVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

CREATE FUNCTION protect_event_team_roster() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."eventTeamId"<>OLD."eventTeamId" OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Invalid event team roster identity or revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_team_roster_identity BEFORE UPDATE ON "EventTeamRoster" FOR EACH ROW EXECUTE FUNCTION protect_event_team_roster();

CREATE FUNCTION protect_event_match_staff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW."eventId"<>OLD."eventId" OR NEW."scheduleRevision"<>OLD."scheduleRevision" OR NEW."matchId"<>OLD."matchId" OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Invalid match staff identity or revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_match_staff_identity BEFORE UPDATE ON "EventMatchStaff" FOR EACH ROW EXECUTE FUNCTION protect_event_match_staff();
