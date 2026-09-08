-- CreateEnum
CREATE TYPE "TaskPublicationState" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialTask" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "configuration" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" "TaskPublicationState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MaterialTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementVersion" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "RequirementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentHistory" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "previousHandlerGrantId" UUID,
    "previousReviewerGrantId" UUID,
    "handlerGrantId" UUID NOT NULL,
    "reviewerGrantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialTask_eventId_state_idx" ON "MaterialTask"("eventId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialTask_id_eventId_key" ON "MaterialTask"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementVersion_taskId_key" ON "RequirementVersion"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementVersion_taskId_version_key" ON "RequirementVersion"("taskId", "version");

-- CreateIndex
CREATE INDEX "AssignmentHistory_taskId_createdAt_idx" ON "AssignmentHistory"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskScope_id_eventId_key" ON "TaskScope"("id", "eventId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_id_fkey" FOREIGN KEY ("id") REFERENCES "EventScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTask" ADD CONSTRAINT "MaterialTask_id_eventId_fkey" FOREIGN KEY ("id", "eventId") REFERENCES "TaskScope"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTask" ADD CONSTRAINT "MaterialTask_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaterialTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentHistory" ADD CONSTRAINT "AssignmentHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaterialTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Application-level guards are backed by immutable database history.
CREATE FUNCTION reject_material_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Material history is immutable' USING ERRCODE = '42501'; END;
$$;
CREATE TRIGGER immutable_requirements BEFORE UPDATE OR DELETE OR TRUNCATE ON "RequirementVersion"
FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE TRIGGER immutable_assignments BEFORE UPDATE OR DELETE OR TRUNCATE ON "AssignmentHistory"
FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

CREATE FUNCTION protect_published_task() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'PUBLISHED' THEN RAISE EXCEPTION 'Published task is protected' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_published_task BEFORE UPDATE OR DELETE ON "MaterialTask"
FOR EACH ROW EXECUTE FUNCTION protect_published_task();

CREATE FUNCTION protect_business_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MaterialTask" WHERE id = OLD.id AND state = 'PUBLISHED')
  AND (TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Published assignment is protected' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_business_assignment BEFORE UPDATE OR DELETE ON "TaskScope"
FOR EACH ROW EXECUTE FUNCTION protect_business_assignment();

CREATE FUNCTION check_published_requirements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task_id uuid; task_state text; configured jsonb; snapshot jsonb; total integer;
BEGIN
  IF TG_TABLE_NAME = 'MaterialTask' THEN task_id := NEW.id; ELSE task_id := NEW."taskId"; END IF;
  SELECT state::text, configuration INTO task_state, configured FROM "MaterialTask" WHERE id = task_id;
  SELECT count(*) INTO total FROM "RequirementVersion" WHERE "taskId" = task_id;
  SELECT configuration INTO snapshot FROM "RequirementVersion" WHERE "taskId" = task_id;
  IF (task_state = 'PUBLISHED' AND (total <> 1 OR snapshot IS DISTINCT FROM configured))
     OR (task_state = 'DRAFT' AND total <> 0) THEN
    RAISE EXCEPTION 'Publication and requirement snapshot must commit together' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER publication_snapshot AFTER INSERT OR UPDATE ON "MaterialTask"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_published_requirements();
CREATE CONSTRAINT TRIGGER snapshot_publication AFTER INSERT ON "RequirementVersion"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_published_requirements();
ALTER TABLE "MaterialTask" ADD CONSTRAINT valid_publication CHECK (
  revision > 0 AND ((state = 'DRAFT' AND "publishedAt" IS NULL) OR (state = 'PUBLISHED' AND "publishedAt" IS NOT NULL))
);
ALTER TABLE "RequirementVersion" ADD CONSTRAINT first_requirement_version CHECK (version = 1);

DO $$
DECLARE runtime_role text;
BEGIN
  IF current_user = 'caau_dev_owner' THEN runtime_role := 'caau_dev_app';
  ELSIF current_user = 'caau_test_owner' THEN runtime_role := 'caau_test_app';
  ELSE RETURN;
  END IF;
  EXECUTE format('GRANT SELECT, INSERT ON "Event", "RequirementVersion", "AssignmentHistory" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "MaterialTask" TO %I', runtime_role);
END;
$$;
