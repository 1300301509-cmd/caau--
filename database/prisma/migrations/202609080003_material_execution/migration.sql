-- CreateEnum
CREATE TYPE "ExecutionState" AS ENUM ('EDITING', 'SUBMITTED', 'APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UploadState" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "TaskExecution" (
    "taskId" UUID NOT NULL,
    "state" "ExecutionState" NOT NULL DEFAULT 'EDITING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "deadlines" JSONB NOT NULL,
    "nextVersion" INTEGER NOT NULL DEFAULT 1,
    "currentSubmissionId" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "closedBy" UUID,
    "closeReason" VARCHAR(2000),

    CONSTRAINT "TaskExecution_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "MaterialDraft" (
    "taskId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "entries" JSONB NOT NULL DEFAULT '[]',
    "baseSubmissionId" UUID,

    CONSTRAINT "MaterialDraft_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "DraftEdit" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "storageKey" UUID NOT NULL,
    "extension" VARCHAR(12) NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "boundAt" TIMESTAMPTZ(3),

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionVersion" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "requirementVersionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entries" JSONB NOT NULL,
    "deadlines" JSONB NOT NULL,

    CONSTRAINT "SubmissionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAttachment" (
    "submissionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "taskId" UUID NOT NULL,

    CONSTRAINT "SubmissionAttachment_pkey" PRIMARY KEY ("submissionId","fileId")
);

-- CreateTable
CREATE TABLE "SubmissionCommand" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "submissionId" UUID NOT NULL,

    CONSTRAINT "SubmissionCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRecord" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" VARCHAR(8) NOT NULL,
    "issues" JSONB NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineHistory" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(2000) NOT NULL,
    "previous" JSONB NOT NULL,
    "next" JSONB NOT NULL,

    CONSTRAINT "DeadlineHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftEdit_taskId_revision_key" ON "DraftEdit"("taskId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FileUpload_storageKey_key" ON "FileUpload"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "FileUpload_id_taskId_key" ON "FileUpload"("id", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionVersion_taskId_version_key" ON "SubmissionVersion"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionVersion_id_taskId_key" ON "SubmissionVersion"("id", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionCommand_submissionId_key" ON "SubmissionCommand"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionCommand_taskId_actorId_key_key" ON "SubmissionCommand"("taskId", "actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionCommand_submissionId_taskId_key" ON "SubmissionCommand"("submissionId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRecord_submissionId_key" ON "ReviewRecord"("submissionId");

-- AddForeignKey
ALTER TABLE "TaskExecution" ADD CONSTRAINT "TaskExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaterialTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDraft" ADD CONSTRAINT "MaterialDraft_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskExecution"("taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftEdit" ADD CONSTRAINT "DraftEdit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskExecution"("taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskExecution"("taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionVersion" ADD CONSTRAINT "SubmissionVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskExecution"("taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttachment" ADD CONSTRAINT "SubmissionAttachment_submissionId_taskId_fkey" FOREIGN KEY ("submissionId", "taskId") REFERENCES "SubmissionVersion"("id", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttachment" ADD CONSTRAINT "SubmissionAttachment_fileId_taskId_fkey" FOREIGN KEY ("fileId", "taskId") REFERENCES "FileUpload"("id", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionCommand" ADD CONSTRAINT "SubmissionCommand_submissionId_taskId_fkey" FOREIGN KEY ("submissionId", "taskId") REFERENCES "SubmissionVersion"("id", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineHistory" ADD CONSTRAINT "DeadlineHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskExecution"("taskId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve published requirements and derive current execution metadata without rewriting them.
INSERT INTO "TaskExecution" ("taskId", deadlines)
SELECT id, jsonb_build_object('task', configuration->>'deadline', 'materials',
  (SELECT jsonb_agg(jsonb_build_object('id', m->>'id', 'deadline', m->>'deadline'))
   FROM jsonb_array_elements(configuration->'materials') m))
FROM "MaterialTask" WHERE state = 'PUBLISHED';
INSERT INTO "MaterialDraft" ("taskId") SELECT "taskId" FROM "TaskExecution";

CREATE OR REPLACE FUNCTION protect_business_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_org uuid; new_org uuid; publication text;
BEGIN
  SELECT state::text INTO publication FROM "MaterialTask" WHERE id = OLD.id;
  IF publication IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Business assignment must be retained' USING ERRCODE = '23514'; END IF;
    SELECT m."organizationId" INTO old_org FROM "EventGrant" g JOIN "OrganizationMember" m ON m.id=g."memberId" WHERE g.id=OLD."handlerGrantId";
    SELECT m."organizationId" INTO new_org FROM "EventGrant" g JOIN "OrganizationMember" m ON m.id=g."memberId" WHERE g.id=NEW."handlerGrantId";
    IF old_org IS DISTINCT FROM new_org OR NEW."eventId" <> OLD."eventId" OR NEW.id <> OLD.id
      OR (publication = 'PUBLISHED' AND NEW."reviewerGrantId" IS DISTINCT FROM OLD."reviewerGrantId") THEN
      RAISE EXCEPTION 'Cross-organization transfer or published reviewer change prohibited' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['DraftEdit','SubmissionVersion','SubmissionAttachment','SubmissionCommand','ReviewRecord','DeadlineHistory'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation()', t);
  END LOOP;
END;
$$;

CREATE FUNCTION protect_confirmed_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['state','confirmedAt','boundAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','confirmedAt','boundAt'])
    OR (OLD.state='CONFIRMED' AND (NEW.state <> OLD.state OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt"))
    OR (OLD."boundAt" IS NOT NULL AND NEW."boundAt" IS DISTINCT FROM OLD."boundAt") THEN
    RAISE EXCEPTION 'File metadata is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_file_metadata BEFORE UPDATE ON "FileUpload" FOR EACH ROW EXECUTE FUNCTION protect_confirmed_file();

CREATE FUNCTION check_execution_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.state='CLOSED' AND NEW IS DISTINCT FROM OLD)
     OR (OLD.state='APPROVED' AND NEW.state NOT IN ('APPROVED','CLOSED'))
     OR (OLD.state='EDITING' AND NEW.state NOT IN ('EDITING','SUBMITTED','CLOSED'))
     OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Invalid execution transition/revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER execution_transition BEFORE UPDATE ON "TaskExecution" FOR EACH ROW EXECUTE FUNCTION check_execution_transition();
ALTER TABLE "TaskExecution" ADD CONSTRAINT execution_positive CHECK (revision > 0 AND generation > 0 AND "nextVersion" > 0);
ALTER TABLE "MaterialDraft" ADD CONSTRAINT draft_positive CHECK (revision > 0 AND jsonb_typeof(entries) = 'array');
ALTER TABLE "FileUpload" ADD CONSTRAINT upload_consistency CHECK (
 "expectedBytes" > 0 AND "expectedBytes" <= 10485760 AND generation > 0
 AND ((state='PENDING' AND "confirmedAt" IS NULL AND "boundAt" IS NULL) OR (state='CONFIRMED' AND "confirmedAt" IS NOT NULL))
);
ALTER TABLE "ReviewRecord" ADD CONSTRAINT review_decision CHECK ((decision='PASS' AND jsonb_array_length(issues)=0) OR (decision='RETURN' AND jsonb_array_length(issues)>0));

CREATE FUNCTION check_submission_requirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "RequirementVersion" WHERE id=NEW."requirementVersionId" AND "taskId"=NEW."taskId") THEN
    RAISE EXCEPTION 'Submission requirement/task mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER submission_requirement BEFORE INSERT ON "SubmissionVersion" FOR EACH ROW EXECUTE FUNCTION check_submission_requirement();

DO $$
DECLARE runtime_role text;
BEGIN
  IF current_user='caau_dev_owner' THEN runtime_role := 'caau_dev_app';
  ELSIF current_user='caau_test_owner' THEN runtime_role := 'caau_test_app';
  ELSE RETURN; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "TaskExecution", "MaterialDraft", "FileUpload" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT ON "DraftEdit", "SubmissionVersion", "SubmissionAttachment", "SubmissionCommand", "ReviewRecord", "DeadlineHistory" TO %I', runtime_role);
END;
$$;
