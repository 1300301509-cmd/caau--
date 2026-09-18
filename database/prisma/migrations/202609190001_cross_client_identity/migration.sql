-- Record the client that created each opaque session without changing existing sessions.
CREATE TYPE "SessionClientType" AS ENUM ('LEGACY', 'WEB_PASSWORD', 'WECHAT_MINIAPP', 'LOCAL_TEST');
ALTER TABLE "Session"
  ADD COLUMN "clientType" "SessionClientType" NOT NULL DEFAULT 'LEGACY';

-- A platform identity is only an authentication credential. Business ownership
-- continues to reference InternalUser and OrganizationMember.
CREATE TABLE "WechatIdentity" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "appId" VARCHAR(32) NOT NULL,
  "openId" VARCHAR(128) NOT NULL,
  "unionId" VARCHAR(128),
  "boundAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WechatIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WechatIdentity_appId_nonempty" CHECK (length("appId") > 0),
  CONSTRAINT "WechatIdentity_openId_nonempty" CHECK (length("openId") > 0),
  CONSTRAINT "WechatIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WechatIdentity_appId_openId_key" ON "WechatIdentity"("appId", "openId");
CREATE UNIQUE INDEX "WechatIdentity_appId_userId_key" ON "WechatIdentity"("appId", "userId");

-- Raw binding credentials are returned once and never stored. A binding intent
-- is tied to the password-authenticated Web session that created it.
CREATE TABLE "IdentityBindingIntent" (
  "id" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "IdentityBindingIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityBindingIntent_tokenHash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "IdentityBindingIntent_expiry_after_creation" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "IdentityBindingIntent_consumed_after_creation" CHECK ("consumedAt" IS NULL OR "consumedAt" >= "createdAt"),
  CONSTRAINT "IdentityBindingIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IdentityBindingIntent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IdentityBindingIntent_tokenHash_key" ON "IdentityBindingIntent"("tokenHash");
CREATE INDEX "IdentityBindingIntent_userId_expiresAt_idx" ON "IdentityBindingIntent"("userId", "expiresAt");

-- Local dev/test roles only. Deployment identities require a separately reviewed policy.
DO $$
DECLARE runtime_role text;
BEGIN
  IF current_user = 'caau_dev_owner' THEN runtime_role := 'caau_dev_app';
  ELSIF current_user = 'caau_test_owner' THEN runtime_role := 'caau_test_app';
  ELSE RETURN;
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "WechatIdentity", "IdentityBindingIntent" TO %I', runtime_role);
END;
$$;
