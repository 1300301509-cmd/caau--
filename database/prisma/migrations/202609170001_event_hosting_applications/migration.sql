-- CreateEnum
CREATE TYPE "HostingApplicationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'NEEDS_SUPPLEMENT', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "HostingRequirementCode" AS ENUM ('BUSINESS_LICENSE', 'VENUE_PHOTO', 'OTHER_DOCUMENT');

-- CreateEnum
CREATE TYPE "EventLifecycleState" AS ENUM ('PREPARING_INTERNAL');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HEADQUARTERS_SUPER_ADMIN';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "lifecycleState" "EventLifecycleState";

-- CreateTable
CREATE TABLE "HostingApplicationHandlerGrant" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "grantedBy" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedBy" UUID,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "HostingApplicationHandlerGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingApplicationReviewGrant" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "grantedBy" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedBy" UUID,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "HostingApplicationReviewGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventHostingApplication" (
    "id" UUID NOT NULL,
    "applicantOrganizationId" UUID NOT NULL,
    "status" "HostingApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "draftRevision" INTEGER NOT NULL DEFAULT 1,
    "nextVersion" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "currentSubmissionId" UUID,
    "approvedEventId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventHostingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingApplicationSubmission" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "form" JSONB NOT NULL,
    "requirementSnapshot" JSONB NOT NULL,
    "submittedBy" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostingApplicationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingApplicationUpload" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requirementCode" "HostingRequirementCode" NOT NULL,
    "actorId" UUID NOT NULL,
    "storageKey" UUID NOT NULL,
    "originalName" VARCHAR(180) NOT NULL,
    "extension" VARCHAR(12) NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'PENDING',
    "bound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HostingApplicationUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingSubmissionAttachment" (
    "submissionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "requirementCode" "HostingRequirementCode" NOT NULL,

    CONSTRAINT "HostingSubmissionAttachment_pkey" PRIMARY KEY ("submissionId","fileId")
);

-- CreateTable
CREATE TABLE "HostingApplicationAction" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "submissionId" UUID,
    "revision" INTEGER NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "fromState" "HostingApplicationStatus" NOT NULL,
    "toState" "HostingApplicationStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "HostingApplicationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingApplicationCommand" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "HostingApplicationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOrigin" (
    "eventId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "approvedSubmissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOrigin_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "EventProfileVersion" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "profile" JSONB NOT NULL,
    "sourceSubmissionId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOrganizerAppointment" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceApplicationId" UUID NOT NULL,
    "sourceSubmissionId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "EventOrganizerAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInformationAccessGrant" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "sourceHandlerGrantId" UUID NOT NULL,
    "sourceApplicationId" UUID NOT NULL,
    "sourceSubmissionId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EventInformationAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationHandlerGrant_memberId_key" ON "HostingApplicationHandlerGrant"("memberId");

-- CreateIndex
CREATE INDEX "HostingApplicationHandlerGrant_organizationId_active_idx" ON "HostingApplicationHandlerGrant"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationReviewGrant_memberId_key" ON "HostingApplicationReviewGrant"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventHostingApplication_approvedEventId_key" ON "EventHostingApplication"("approvedEventId");

-- CreateIndex
CREATE INDEX "EventHostingApplication_applicantOrganizationId_status_crea_idx" ON "EventHostingApplication"("applicantOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationSubmission_applicationId_version_key" ON "HostingApplicationSubmission"("applicationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationSubmission_id_applicationId_key" ON "HostingApplicationSubmission"("id", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationUpload_storageKey_key" ON "HostingApplicationUpload"("storageKey");

-- CreateIndex
CREATE INDEX "HostingApplicationUpload_applicationId_requirementCode_boun_idx" ON "HostingApplicationUpload"("applicationId", "requirementCode", "bound");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationUpload_id_applicationId_key" ON "HostingApplicationUpload"("id", "applicationId");

-- CreateIndex
CREATE INDEX "HostingApplicationAction_submissionId_action_idx" ON "HostingApplicationAction"("submissionId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationAction_applicationId_revision_key" ON "HostingApplicationAction"("applicationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "HostingApplicationCommand_actorId_key_key" ON "HostingApplicationCommand"("actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EventOrigin_applicationId_key" ON "EventOrigin"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventOrigin_approvedSubmissionId_key" ON "EventOrigin"("approvedSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventProfileVersion_eventId_version_key" ON "EventProfileVersion"("eventId", "version");

-- CreateIndex
CREATE INDEX "EventOrganizerAppointment_organizationId_active_idx" ON "EventOrganizerAppointment"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EventOrganizerAppointment_eventId_organizationId_sourceAppl_key" ON "EventOrganizerAppointment"("eventId", "organizationId", "sourceApplicationId");

-- CreateIndex
CREATE INDEX "EventInformationAccessGrant_memberId_active_idx" ON "EventInformationAccessGrant"("memberId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EventInformationAccessGrant_eventId_memberId_sourceHandlerG_key" ON "EventInformationAccessGrant"("eventId", "memberId", "sourceHandlerGrantId");

-- AddForeignKey
ALTER TABLE "HostingApplicationHandlerGrant" ADD CONSTRAINT "HostingApplicationHandlerGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationHandlerGrant" ADD CONSTRAINT "HostingApplicationHandlerGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationReviewGrant" ADD CONSTRAINT "HostingApplicationReviewGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT "EventHostingApplication_applicantOrganizationId_fkey" FOREIGN KEY ("applicantOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT "EventHostingApplication_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT "EventHostingApplication_approvedEventId_fkey" FOREIGN KEY ("approvedEventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationSubmission" ADD CONSTRAINT "HostingApplicationSubmission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationSubmission" ADD CONSTRAINT "HostingApplicationSubmission_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationUpload" ADD CONSTRAINT "HostingApplicationUpload_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationUpload" ADD CONSTRAINT "HostingApplicationUpload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingSubmissionAttachment" ADD CONSTRAINT "HostingSubmissionAttachment_submissionId_applicationId_fkey" FOREIGN KEY ("submissionId", "applicationId") REFERENCES "HostingApplicationSubmission"("id", "applicationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingSubmissionAttachment" ADD CONSTRAINT "HostingSubmissionAttachment_fileId_applicationId_fkey" FOREIGN KEY ("fileId", "applicationId") REFERENCES "HostingApplicationUpload"("id", "applicationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationAction" ADD CONSTRAINT "HostingApplicationAction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationAction" ADD CONSTRAINT "HostingApplicationAction_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "HostingApplicationSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingApplicationCommand" ADD CONSTRAINT "HostingApplicationCommand_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrigin" ADD CONSTRAINT "EventOrigin_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrigin" ADD CONSTRAINT "EventOrigin_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrigin" ADD CONSTRAINT "EventOrigin_approvedSubmissionId_fkey" FOREIGN KEY ("approvedSubmissionId") REFERENCES "HostingApplicationSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventProfileVersion" ADD CONSTRAINT "EventProfileVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizerAppointment" ADD CONSTRAINT "EventOrganizerAppointment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizerAppointment" ADD CONSTRAINT "EventOrganizerAppointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizerAppointment" ADD CONSTRAINT "EventOrganizerAppointment_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizerAppointment" ADD CONSTRAINT "EventOrganizerAppointment_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "HostingApplicationSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInformationAccessGrant" ADD CONSTRAINT "EventInformationAccessGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInformationAccessGrant" ADD CONSTRAINT "EventInformationAccessGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInformationAccessGrant" ADD CONSTRAINT "EventInformationAccessGrant_sourceHandlerGrantId_fkey" FOREIGN KEY ("sourceHandlerGrantId") REFERENCES "HostingApplicationHandlerGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInformationAccessGrant" ADD CONSTRAINT "EventInformationAccessGrant_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "EventHostingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInformationAccessGrant" ADD CONSTRAINT "EventInformationAccessGrant_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "HostingApplicationSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CAAU-027 invariants and local runtime privileges.
ALTER TABLE "EventHostingApplication" ADD CONSTRAINT hosting_application_positive CHECK (
  revision > 0 AND "draftRevision" > 0 AND "nextVersion" > 0 AND jsonb_typeof(draft) = 'object'
);
ALTER TABLE "HostingApplicationUpload" ADD CONSTRAINT hosting_upload_consistency CHECK (
  "expectedBytes" > 0 AND "expectedBytes" <= 10485760 AND
  extension IN ('pdf','png','jpg','jpeg') AND
  ((state = 'PENDING' AND "confirmedAt" IS NULL AND bound = false) OR
   (state = 'CONFIRMED' AND "confirmedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX hosting_terminal_decision ON "HostingApplicationAction"("submissionId")
  WHERE action IN ('REQUEST_SUPPLEMENT','REJECT','APPROVE');

DO $$
DECLARE t text; runtime_role text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'HostingApplicationSubmission','HostingSubmissionAttachment','HostingApplicationAction',
    'HostingApplicationCommand','EventOrigin','EventProfileVersion','EventOrganizerAppointment'
  ] LOOP
    EXECUTE format('CREATE TRIGGER immutable_hosting_history BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation()', t);
  END LOOP;
  runtime_role := CASE
    WHEN current_user = 'caau_dev_owner' THEN 'caau_dev_app'
    WHEN current_user = 'caau_test_owner' THEN 'caau_test_app'
    ELSE NULL
  END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "HostingApplicationHandlerGrant", "HostingApplicationReviewGrant", "EventHostingApplication", "HostingApplicationUpload", "EventInformationAccessGrant", "Event" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT ON "HostingApplicationSubmission", "HostingSubmissionAttachment", "HostingApplicationAction", "HostingApplicationCommand", "EventOrigin", "EventProfileVersion", "EventOrganizerAppointment" TO %I', runtime_role);
END $$;

CREATE FUNCTION protect_hosting_upload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW."applicationId", NEW."organizationId", NEW."requirementCode", NEW."actorId", NEW."storageKey", NEW."originalName", NEW.extension, NEW."expectedBytes", NEW.sha256, NEW."createdAt", NEW."expiresAt")
     IS DISTINCT FROM
     (OLD.id, OLD."applicationId", OLD."organizationId", OLD."requirementCode", OLD."actorId", OLD."storageKey", OLD."originalName", OLD.extension, OLD."expectedBytes", OLD.sha256, OLD."createdAt", OLD."expiresAt")
  THEN RAISE EXCEPTION 'Hosting upload identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state = 'CONFIRMED' AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'Confirmed hosting upload is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hosting_upload_metadata BEFORE UPDATE ON "HostingApplicationUpload"
FOR EACH ROW EXECUTE FUNCTION protect_hosting_upload();

CREATE FUNCTION protect_hosting_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW."applicantOrganizationId", NEW."createdBy", NEW."createdAt") IS DISTINCT FROM
     (OLD.id, OLD."applicantOrganizationId", OLD."createdBy", OLD."createdAt")
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
  IF NEW.status = 'APPROVED' AND NEW."approvedEventId" IS NULL THEN
    RAISE EXCEPTION 'Approved application requires an event' USING ERRCODE='23514';
  ELSIF NEW.status <> 'APPROVED' AND NEW."approvedEventId" IS NOT NULL THEN
    RAISE EXCEPTION 'Only approval may set an event' USING ERRCODE='23514';
  END IF;
  IF OLD."approvedEventId" IS NOT NULL AND NEW."approvedEventId" IS DISTINCT FROM OLD."approvedEventId" THEN
    RAISE EXCEPTION 'Approved event pointer is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hosting_application_transition BEFORE UPDATE ON "EventHostingApplication"
FOR EACH ROW EXECUTE FUNCTION protect_hosting_application();

CREATE FUNCTION check_hosting_action_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action NOT IN ('CREATE','SAVE','UPLOAD_BIND','UPLOAD_REMOVE','SUBMIT','START_REVIEW','REQUEST_SUPPLEMENT','REJECT','APPROVE') THEN
    RAISE EXCEPTION 'Invalid hosting action' USING ERRCODE='23514';
  END IF;
  IF NEW."submissionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "HostingApplicationSubmission" s
    WHERE s.id = NEW."submissionId" AND s."applicationId" = NEW."applicationId"
  ) THEN RAISE EXCEPTION 'Cross-application hosting action' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "EventHostingApplication" a
    WHERE a.id = NEW."applicationId" AND a.revision = NEW.revision
  ) THEN RAISE EXCEPTION 'Hosting action revision does not match aggregate' USING ERRCODE='23514'; END IF;
  IF NEW.action IN ('REQUEST_SUPPLEMENT','REJECT') AND
     coalesce(length(trim(NEW.detail->>'reason')), 0) = 0
  THEN RAISE EXCEPTION 'Review reason is required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hosting_action_target BEFORE INSERT ON "HostingApplicationAction"
FOR EACH ROW EXECUTE FUNCTION check_hosting_action_target();

CREATE FUNCTION check_event_origin_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "HostingApplicationSubmission" s
    WHERE s.id = NEW."approvedSubmissionId" AND s."applicationId" = NEW."applicationId"
  ) THEN RAISE EXCEPTION 'Cross-application event origin' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_origin_consistency BEFORE INSERT ON "EventOrigin"
FOR EACH ROW EXECUTE FUNCTION check_event_origin_consistency();
