CREATE TABLE "AgentPlanningRequest" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "type" VARCHAR(32) NOT NULL DEFAULT 'SCHEDULE_PLANNING',
  "status" VARCHAR(16) NOT NULL DEFAULT 'COLLECTING',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "confirmedRevision" INTEGER,
  "conditions" JSONB NOT NULL DEFAULT '[]',
  "pending" JSONB NOT NULL DEFAULT '[]',
  "unresolved" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentPlanningRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentPlanningRequest_type_check" CHECK ("type" = 'SCHEDULE_PLANNING'),
  CONSTRAINT "AgentPlanningRequest_status_check" CHECK ("status" IN ('COLLECTING', 'CONFIRMED')),
  CONSTRAINT "AgentPlanningRequest_revision_check" CHECK ("revision" >= 1 AND ("confirmedRevision" IS NULL OR "confirmedRevision" = "revision")),
  CONSTRAINT "AgentPlanningRequest_conditions_check" CHECK (jsonb_typeof("conditions") = 'array' AND jsonb_typeof("pending") = 'array' AND jsonb_typeof("unresolved") = 'array')
);
CREATE UNIQUE INDEX "AgentPlanningRequest_sessionId_eventId_key" ON "AgentPlanningRequest"("sessionId", "eventId");
CREATE INDEX "AgentPlanningRequest_ownerId_updatedAt_idx" ON "AgentPlanningRequest"("ownerId", "updatedAt");
ALTER TABLE "AgentPlanningRequest" ADD CONSTRAINT "AgentPlanningRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentPlanningRequest" ADD CONSTRAINT "AgentPlanningRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentPlanningRequest" ADD CONSTRAINT "AgentPlanningRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
