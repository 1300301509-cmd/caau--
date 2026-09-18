ALTER TABLE "EventHostingApplication" ADD COLUMN "materialEventId" UUID;
CREATE UNIQUE INDEX "EventHostingApplication_materialEventId_key" ON "EventHostingApplication"("materialEventId");
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT "EventHostingApplication_materialEventId_fkey" FOREIGN KEY ("materialEventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT material_dossier_no_new_event CHECK ("materialEventId" IS NULL OR ("approvedEventId" IS NULL AND status <> 'REJECTED'));
CREATE OR REPLACE FUNCTION protect_hosting_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW."applicantOrganizationId", NEW."createdBy", NEW."createdAt", NEW."materialEventId") IS DISTINCT FROM
     (OLD.id, OLD."applicantOrganizationId", OLD."createdBy", OLD."createdAt", OLD."materialEventId")
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
