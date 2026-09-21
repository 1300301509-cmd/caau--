CREATE TABLE "EventStaff" (
 "id" UUID PRIMARY KEY, "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "profile" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1,
 "createdBy" UUID NOT NULL, "updatedBy" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT event_staff_values CHECK (revision > 0 AND jsonb_typeof(profile)='object')
);
CREATE INDEX "EventStaff_eventId_active_idx" ON "EventStaff"("eventId", active);
CREATE TABLE "EventStaffVersion" (
 "id" UUID PRIMARY KEY, "staffId" UUID NOT NULL REFERENCES "EventStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "profile" JSONB NOT NULL, "active" BOOLEAN NOT NULL, "revision" INTEGER NOT NULL,
 "actorId" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT event_staff_version_values CHECK (revision > 0 AND jsonb_typeof(profile)='object')
);
CREATE UNIQUE INDEX "EventStaffVersion_staffId_revision_key" ON "EventStaffVersion"("staffId", revision);
DO $$ DECLARE runtime_role text; BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "EventStaff" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "EventStaffVersion" TO %I', runtime_role);
END $$;
CREATE TRIGGER immutable_event_staff_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventStaffVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE FUNCTION protect_event_staff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW."eventId"<>OLD."eventId" OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
 RAISE EXCEPTION 'Invalid staff identity or revision' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER event_staff_identity BEFORE UPDATE ON "EventStaff" FOR EACH ROW EXECUTE FUNCTION protect_event_staff();
