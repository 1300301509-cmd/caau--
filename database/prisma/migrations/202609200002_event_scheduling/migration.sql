-- CreateEnum
CREATE TYPE "ScheduleFormat" AS ENUM ('ROUND_ROBIN', 'SINGLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "EventSchedule" (
    "eventId" UUID NOT NULL,
    "format" "ScheduleFormat" NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "matches" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "lastCommandId" UUID NOT NULL,
    "lastCommandHash" VARCHAR(64) NOT NULL,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "publishedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EventSchedule_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "EventScheduleVersion" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "format" "ScheduleFormat" NOT NULL,
    "status" "ScheduleStatus" NOT NULL,
    "config" JSONB NOT NULL,
    "matches" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSchedule_lastCommandId_key" ON "EventSchedule"("lastCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "EventScheduleVersion_eventId_revision_key" ON "EventScheduleVersion"("eventId", "revision");

-- AddForeignKey
ALTER TABLE "EventSchedule" ADD CONSTRAINT "EventSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventScheduleVersion" ADD CONSTRAINT "EventScheduleVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventSchedule"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE runtime_role text;
BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "EventSchedule" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "EventScheduleVersion" TO %I', runtime_role);
END $$;

CREATE TRIGGER immutable_event_schedule_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventScheduleVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

ALTER TABLE "EventSchedule" ADD CONSTRAINT event_schedule_revision CHECK (revision > 0 AND jsonb_typeof(config)='object' AND jsonb_typeof(matches)='array' AND jsonb_typeof(issues)='array');

CREATE FUNCTION protect_event_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."eventId"<>OLD."eventId" OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Invalid event schedule identity or revision' USING ERRCODE='23514';
 END IF;
 IF NEW.status='PUBLISHED' AND jsonb_array_length(NEW.issues)>0 THEN
   RAISE EXCEPTION 'Cannot publish invalid schedule' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_schedule_identity BEFORE UPDATE ON "EventSchedule" FOR EACH ROW EXECUTE FUNCTION protect_event_schedule();
