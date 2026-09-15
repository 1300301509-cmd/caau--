-- CAAU-012: additive migration. Never rewrite earlier migration files.
-- CreateEnum
CREATE TYPE "IndividualState" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'RETURNED', 'APPROVED');

-- AlterTable
ALTER TABLE "EventGrant" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TaskMaterialChannel" (
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL DEFAULT '',

    CONSTRAINT "TaskMaterialChannel_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "IndividualMaterial" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requirementItemId" UUID,
    "state" "IndividualState" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "draftRevision" INTEGER NOT NULL DEFAULT 1,
    "currentSubmissionId" UUID,
    "nextVersion" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualSubmission" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "generation" INTEGER NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualAction" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "submissionId" UUID,
    "revision" INTEGER NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "fromState" "IndividualState" NOT NULL,
    "toState" "IndividualState" NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB NOT NULL,

    CONSTRAINT "IndividualAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualCommand" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "IndividualCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualUpload" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "storageKey" UUID NOT NULL,
    "originalName" VARCHAR(180) NOT NULL,
    "extension" VARCHAR(12) NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "boundAt" TIMESTAMPTZ(3),

    CONSTRAINT "IndividualUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualAttachment" (
    "submissionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "taskId" UUID NOT NULL,

    CONSTRAINT "IndividualAttachment_pkey" PRIMARY KEY ("submissionId","fileId")
);

-- CreateTable
CREATE TABLE "IndividualAssignmentHistory" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "previousHandlerGrantId" UUID,
    "handlerGrantId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndividualMaterial_taskId_state_id_idx" ON "IndividualMaterial"("taskId", "state", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualMaterial_id_taskId_key" ON "IndividualMaterial"("id", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualSubmission_materialId_version_key" ON "IndividualSubmission"("materialId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualSubmission_id_materialId_taskId_key" ON "IndividualSubmission"("id", "materialId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualAction_materialId_revision_key" ON "IndividualAction"("materialId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualCommand_materialId_actorId_key_key" ON "IndividualCommand"("materialId", "actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualUpload_storageKey_key" ON "IndividualUpload"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualUpload_id_materialId_taskId_key" ON "IndividualUpload"("id", "materialId", "taskId");

-- AddForeignKey
ALTER TABLE "TaskMaterialChannel" ADD CONSTRAINT "TaskMaterialChannel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaterialTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualMaterial" ADD CONSTRAINT "IndividualMaterial_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskMaterialChannel"("taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualSubmission" ADD CONSTRAINT "IndividualSubmission_materialId_taskId_fkey" FOREIGN KEY ("materialId", "taskId") REFERENCES "IndividualMaterial"("id", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualAction" ADD CONSTRAINT "IndividualAction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "IndividualMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualCommand" ADD CONSTRAINT "IndividualCommand_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "IndividualMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualUpload" ADD CONSTRAINT "IndividualUpload_materialId_taskId_fkey" FOREIGN KEY ("materialId", "taskId") REFERENCES "IndividualMaterial"("id", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualAttachment" ADD CONSTRAINT "IndividualAttachment_submissionId_materialId_taskId_fkey" FOREIGN KEY ("submissionId", "materialId", "taskId") REFERENCES "IndividualSubmission"("id", "materialId", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualAttachment" ADD CONSTRAINT "IndividualAttachment_fileId_materialId_taskId_fkey" FOREIGN KEY ("fileId", "materialId", "taskId") REFERENCES "IndividualUpload"("id", "materialId", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IndividualMaterial" ADD CONSTRAINT individual_positive CHECK (revision>0 AND "draftRevision">0 AND "nextVersion">0 AND jsonb_typeof(draft)='object');
ALTER TABLE "IndividualUpload" ADD CONSTRAINT individual_upload_consistency CHECK (
  "expectedBytes">0 AND "expectedBytes"<=10485760 AND generation>0 AND
  ((state='PENDING' AND "confirmedAt" IS NULL AND "boundAt" IS NULL) OR (state='CONFIRMED' AND "confirmedAt" IS NOT NULL))
);
ALTER TABLE "IndividualAction" ADD CONSTRAINT individual_return_reason CHECK (action<>'RETURN' OR (jsonb_typeof(detail->'reason')='string' AND jsonb_typeof(detail->'modification')='string' AND length(trim(detail->>'reason'))>0 AND length(trim(detail->>'modification'))>0 AND detail ? 'reason' AND detail ? 'modification'));

-- One immutable terminal decision per submission (START is not a lease).
CREATE UNIQUE INDEX individual_terminal_decision ON "IndividualAction"("submissionId") WHERE action IN ('APPROVE','RETURN');
DO $$ DECLARE t text; runtime_role text; BEGIN
  FOREACH t IN ARRAY ARRAY['TaskMaterialChannel','IndividualSubmission','IndividualAttachment','IndividualAction','IndividualCommand','IndividualAssignmentHistory'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_individual_history BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation()',t);
  END LOOP;
  runtime_role := CASE WHEN current_user = 'caau_dev_owner' THEN 'caau_dev_app' WHEN current_user = 'caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT ON "TaskMaterialChannel", "IndividualSubmission", "IndividualAttachment", "IndividualAction", "IndividualCommand", "IndividualAssignmentHistory" TO %I',runtime_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "IndividualMaterial", "IndividualUpload" TO %I',runtime_role);
END $$;

CREATE FUNCTION protect_individual_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.state='CONFIRMED' AND (to_jsonb(NEW)-'boundAt') IS DISTINCT FROM (to_jsonb(OLD)-'boundAt') THEN
    RAISE EXCEPTION 'Confirmed individual file is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD."boundAt" IS NOT NULL AND NEW."boundAt" IS DISTINCT FROM OLD."boundAt" THEN RAISE EXCEPTION 'Binding timestamp immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER individual_upload_metadata BEFORE UPDATE ON "IndividualUpload" FOR EACH ROW EXECUTE FUNCTION protect_individual_upload();

CREATE FUNCTION protect_individual_material() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.id,NEW."taskId",NEW."organizationId",NEW."requirementItemId",NEW."actorId",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."taskId",OLD."organizationId",OLD."requirementItemId",OLD."actorId",OLD."createdAt") THEN RAISE EXCEPTION 'Material identity immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state='APPROVED' OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Material frozen or invalid revision' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD.state IN ('DRAFT','RETURNED') AND NEW.state IN (OLD.state,'PENDING_REVIEW')) OR (OLD.state='PENDING_REVIEW' AND NEW.state='IN_REVIEW') OR (OLD.state='IN_REVIEW' AND NEW.state IN ('APPROVED','RETURNED'))) THEN RAISE EXCEPTION 'Invalid individual transition' USING ERRCODE='23514'; END IF;
  IF NEW.draft IS DISTINCT FROM OLD.draft AND (OLD.state NOT IN ('DRAFT','RETURNED') OR NEW.state<>OLD.state OR NEW."draftRevision"<>OLD."draftRevision"+1) THEN RAISE EXCEPTION 'Draft cannot change here' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER individual_transition BEFORE UPDATE ON "IndividualMaterial" FOR EACH ROW EXECUTE FUNCTION protect_individual_material();

CREATE FUNCTION check_individual_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "IndividualMaterial"; a "IndividualAction"; s "IndividualSubmission";
BEGIN
  SELECT * INTO m FROM "IndividualMaterial" WHERE id=NEW.id;
  SELECT * INTO a FROM "IndividualAction" WHERE "materialId"=m.id AND revision=m.revision;
  IF a.id IS NULL OR a."toState"<>m.state OR a."submissionId" IS DISTINCT FROM m."currentSubmissionId" THEN RAISE EXCEPTION 'State requires matching immutable action' USING ERRCODE='23514'; END IF;
  IF m.state='DRAFT' THEN
    IF m."currentSubmissionId" IS NOT NULL OR m."nextVersion"<>1 THEN RAISE EXCEPTION 'Invalid draft pointer' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT * INTO s FROM "IndividualSubmission" WHERE id=m."currentSubmissionId" AND "materialId"=m.id AND "taskId"=m."taskId";
    IF s.id IS NULL OR s.version<>m."nextVersion"-1 THEN RAISE EXCEPTION 'Invalid submission pointer' USING ERRCODE='23514'; END IF;
  END IF;
  IF m.state IN ('APPROVED','RETURNED') AND NOT EXISTS (SELECT 1 FROM "IndividualAction" WHERE "materialId"=m.id AND "submissionId"=m."currentSubmissionId" AND action=CASE WHEN m.state='APPROVED' THEN 'APPROVE' ELSE 'RETURN' END) THEN RAISE EXCEPTION 'Missing terminal decision' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER individual_consistency AFTER INSERT OR UPDATE ON "IndividualMaterial" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_individual_consistency();

CREATE FUNCTION check_individual_action() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.action NOT IN ('CREATE','SAVE','SUBMIT','START','APPROVE','RETURN') THEN RAISE EXCEPTION 'Invalid individual action' USING ERRCODE='23514'; END IF;
  IF NEW."submissionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "IndividualSubmission" WHERE id=NEW."submissionId" AND "materialId"=NEW."materialId") THEN RAISE EXCEPTION 'Cross-material action' USING ERRCODE='23514'; END IF;
  IF NEW.action IN ('SUBMIT','START','APPROVE','RETURN') AND NEW."submissionId" IS NULL THEN RAISE EXCEPTION 'Submission required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER individual_action_target BEFORE INSERT ON "IndividualAction" FOR EACH ROW EXECUTE FUNCTION check_individual_action();
