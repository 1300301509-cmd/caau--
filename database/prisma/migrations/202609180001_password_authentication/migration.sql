-- Add nullable credentials so all existing internal users remain intact and non-login-capable.
ALTER TABLE "InternalUser"
  ADD COLUMN "loginName" VARCHAR(64),
  ADD COLUMN "passwordHash" VARCHAR(255),
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordChangedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "InternalUser_loginName_key" ON "InternalUser"("loginName");

ALTER TABLE "InternalUser" ADD CONSTRAINT "InternalUser_credentials_consistent"
  CHECK (
    ("loginName" IS NULL AND "passwordHash" IS NULL AND "mustChangePassword" = false)
    OR
    ("loginName" IS NOT NULL AND "passwordHash" IS NOT NULL)
  );
ALTER TABLE "InternalUser" ADD CONSTRAINT "InternalUser_loginName_normalized"
  CHECK ("loginName" IS NULL OR "loginName" ~ '^[a-z0-9][a-z0-9._-]{2,63}$');

ALTER TABLE "Session"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AuthenticationThrottle" (
  "subjectHash" CHAR(64) NOT NULL,
  "failures" INTEGER NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "blockedUntil" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthenticationThrottle_pkey" PRIMARY KEY ("subjectHash"),
  CONSTRAINT "AuthenticationThrottle_failures_positive" CHECK ("failures" > 0)
);
CREATE INDEX "AuthenticationThrottle_blockedUntil_idx"
  ON "AuthenticationThrottle"("blockedUntil");

-- Local dev/test roles only. Deployment identities require a separately reviewed policy.
DO $$
DECLARE runtime_role text;
BEGIN
  IF current_user = 'caau_dev_owner' THEN runtime_role := 'caau_dev_app';
  ELSIF current_user = 'caau_test_owner' THEN runtime_role := 'caau_test_app';
  ELSE RETURN;
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "AuthenticationThrottle" TO %I', runtime_role);
END;
$$;
