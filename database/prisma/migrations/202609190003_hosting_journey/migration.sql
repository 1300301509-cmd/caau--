ALTER TABLE "EventHostingApplication" ADD COLUMN "formVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT hosting_form_version CHECK ("formVersion" IN (1,2));
CREATE TABLE "HostingPermit" (
 "applicationId" UUID NOT NULL PRIMARY KEY REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "confirmedBy" UUID NOT NULL,
 "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "key" UUID NOT NULL
);
CREATE UNIQUE INDEX "HostingPermit_key_key" ON "HostingPermit"("key");
CREATE TRIGGER immutable_hosting_permit BEFORE UPDATE OR DELETE OR TRUNCATE ON "HostingPermit" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE FUNCTION validate_hosting_permit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "EventHostingApplication" WHERE id=NEW."applicationId" AND "materialEventId" IS NOT NULL AND status='APPROVED') THEN
 RAISE EXCEPTION 'Hosting permit requires approved materials' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "InternalUser" WHERE id=NEW."confirmedBy" AND active=true) THEN
 RAISE EXCEPTION 'Hosting permit requires active actor' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hosting_permit_target BEFORE INSERT ON "HostingPermit" FOR EACH ROW EXECUTE FUNCTION validate_hosting_permit();
DO $$
DECLARE runtime_role text;
BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT ON "HostingPermit" TO %I', runtime_role);
END $$;
CREATE OR REPLACE FUNCTION protect_hosting_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW."applicantOrganizationId", NEW."createdBy", NEW."createdAt", NEW."materialEventId", NEW."formVersion") IS DISTINCT FROM
     (OLD.id, OLD."applicantOrganizationId", OLD."createdBy", OLD."createdAt", OLD."materialEventId", OLD."formVersion")
  THEN RAISE EXCEPTION 'Hosting application identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Invalid hosting application revision' USING ERRCODE='23514';
  END IF;
  IF NOT (
    (OLD.status IN ('DRAFT','NEEDS_SUPPLEMENT') AND NEW.status = OLD.status) OR
    (OLD.status IN ('DRAFT','NEEDS_SUPPLEMENT') AND NEW.status = 'PENDING_REVIEW') OR
    (OLD.status = 'PENDING_REVIEW' AND NEW.status = 'IN_REVIEW') OR
    (OLD.status = 'IN_REVIEW' AND NEW.status IN ('NEEDS_SUPPLEMENT','REJECTED','APPROVED'))
  ) THEN RAISE EXCEPTION 'Invalid hosting application transition' USING ERRCODE='23514'; END IF;
  IF NEW.status = OLD.status THEN
    IF NEW."draftRevision" <> OLD."draftRevision" + 1 THEN
      RAISE EXCEPTION 'Invalid hosting draft revision' USING ERRCODE='23514';
    END IF;
  ELSIF NEW."draftRevision" <> OLD."draftRevision" THEN
    RAISE EXCEPTION 'Draft revision cannot change during transition' USING ERRCODE='23514';
  END IF;
  IF NEW.draft IS DISTINCT FROM OLD.draft AND NOT (
    OLD.status IN ('DRAFT','NEEDS_SUPPLEMENT') AND NEW.status = OLD.status
  ) THEN RAISE EXCEPTION 'Hosting draft cannot change here' USING ERRCODE='23514'; END IF;
  IF NEW.status = 'PENDING_REVIEW' AND OLD.status IN ('DRAFT','NEEDS_SUPPLEMENT') THEN
    IF NEW."nextVersion" <> OLD."nextVersion" + 1 OR
       NEW."currentSubmissionId" IS NULL OR
       NEW."currentSubmissionId" IS NOT DISTINCT FROM OLD."currentSubmissionId"
    THEN RAISE EXCEPTION 'Submission transition requires a new version' USING ERRCODE='23514'; END IF;
  ELSIF NEW."nextVersion" <> OLD."nextVersion" OR
        NEW."currentSubmissionId" IS DISTINCT FROM OLD."currentSubmissionId"
  THEN RAISE EXCEPTION 'Submission pointer changed outside submit' USING ERRCODE='23514'; END IF;
  IF NEW."currentSubmissionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "HostingApplicationSubmission" s
    WHERE s.id = NEW."currentSubmissionId" AND s."applicationId" = NEW.id
  ) THEN RAISE EXCEPTION 'Cross-application current submission' USING ERRCODE='23514'; END IF;
  IF NEW.status = 'APPROVED' AND NEW."approvedEventId" IS NULL AND NEW."materialEventId" IS NULL THEN
    RAISE EXCEPTION 'Approved application requires an event' USING ERRCODE='23514';
  ELSIF NEW.status <> 'APPROVED' AND NEW."approvedEventId" IS NOT NULL THEN
    RAISE EXCEPTION 'Only approval may set an event' USING ERRCODE='23514';
  END IF;
  IF OLD."approvedEventId" IS NOT NULL AND NEW."approvedEventId" IS DISTINCT FROM OLD."approvedEventId" THEN
    RAISE EXCEPTION 'Approved event pointer is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
