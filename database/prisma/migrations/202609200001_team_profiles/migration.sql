-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "profile" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "creationHash" VARCHAR(64) NOT NULL,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTeam" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "profile" JSONB NOT NULL,
    "sourceTeamRevision" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamVersion" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "profile" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTeamVersion" (
    "id" UUID NOT NULL,
    "eventTeamId" UUID NOT NULL,
    "profile" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTeamVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTeam_eventId_teamId_key" ON "EventTeam"("eventId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamVersion_teamId_revision_key" ON "TeamVersion"("teamId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "EventTeamVersion_eventTeamId_revision_key" ON "EventTeamVersion"("eventTeamId", "revision");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamVersion" ADD CONSTRAINT "TeamVersion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeamVersion" ADD CONSTRAINT "EventTeamVersion_eventTeamId_fkey" FOREIGN KEY ("eventTeamId") REFERENCES "EventTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE runtime_role text;
BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "Team", "EventTeam" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT ON "TeamMembership" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "TeamVersion", "EventTeamVersion" TO %I', runtime_role);
END $$;
CREATE TRIGGER immutable_team_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "TeamVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE TRIGGER immutable_event_team_version BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventTeamVersion" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
ALTER TABLE "Team" ADD CONSTRAINT team_revision CHECK (revision > 0 AND jsonb_typeof(profile)='object');
ALTER TABLE "EventTeam" ADD CONSTRAINT event_team_revision CHECK (revision > 0 AND "sourceTeamRevision" > 0 AND jsonb_typeof(profile)='object');
CREATE FUNCTION protect_team_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
 RAISE EXCEPTION 'Invalid team identity or revision' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='Team' THEN
   IF NEW."organizationId"<>OLD."organizationId" OR NEW."creationHash"<>OLD."creationHash" THEN RAISE EXCEPTION 'Team origin is immutable' USING ERRCODE='23514'; END IF;
 ELSE
   IF NEW."eventId"<>OLD."eventId" OR NEW."teamId"<>OLD."teamId" OR NEW."sourceTeamRevision"<>OLD."sourceTeamRevision" THEN RAISE EXCEPTION 'Event team origin is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER team_identity BEFORE UPDATE ON "Team" FOR EACH ROW EXECUTE FUNCTION protect_team_identity();
CREATE TRIGGER event_team_identity BEFORE UPDATE ON "EventTeam" FOR EACH ROW EXECUTE FUNCTION protect_team_identity();
