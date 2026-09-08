-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EVENT_MANAGER', 'ORGANIZER', 'REVIEWER', 'SYSTEM_ADMIN');

-- CreateTable
CREATE TABLE "InternalUser" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InternalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventScope" (
    "id" UUID NOT NULL,

    CONSTRAINT "EventScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGrant" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID NOT NULL,

    CONSTRAINT "EventGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskScope" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "handlerGrantId" UUID NOT NULL,
    "reviewerGrantId" UUID,

    CONSTRAINT "TaskScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRecord" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "resourceId" UUID,
    "outcome" VARCHAR(16) NOT NULL,
    "requestId" UUID NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_organizationId_role_key" ON "OrganizationMember"("userId", "organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "EventGrant_eventId_memberId_key" ON "EventGrant"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventGrant_id_eventId_key" ON "EventGrant"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditRecord_occurredAt_idx" ON "AuditRecord"("occurredAt");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGrant" ADD CONSTRAINT "EventGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGrant" ADD CONSTRAINT "EventGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskScope" ADD CONSTRAINT "TaskScope_handlerGrantId_eventId_fkey" FOREIGN KEY ("handlerGrantId", "eventId") REFERENCES "EventGrant"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskScope" ADD CONSTRAINT "TaskScope_reviewerGrantId_eventId_fkey" FOREIGN KEY ("reviewerGrantId", "eventId") REFERENCES "EventGrant"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Audit is append-only, including when the owner accidentally issues ordinary DML.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditRecord"
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();

-- Local dev/test roles only. Deployment identities require a separate reviewed policy.
DO $$
DECLARE runtime_role text;
BEGIN
  IF current_user = 'caau_dev_owner' THEN runtime_role := 'caau_dev_app';
  ELSIF current_user = 'caau_test_owner' THEN runtime_role := 'caau_test_app';
  ELSE RETURN;
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "InternalUser", "Organization", "OrganizationMember", "EventScope", "EventGrant", "TaskScope", "Session" TO %I', runtime_role);
  EXECUTE format('GRANT SELECT, INSERT ON "AuditRecord" TO %I', runtime_role);
END;
$$;
