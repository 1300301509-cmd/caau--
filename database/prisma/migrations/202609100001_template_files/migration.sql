-- CreateTable
CREATE TABLE "TemplateUpload" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "storageKey" UUID NOT NULL,
    "originalName" VARCHAR(180) NOT NULL,
    "extension" VARCHAR(12) NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    CONSTRAINT "TemplateUpload_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TemplateAttachment" (
    "requirementVersionId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    CONSTRAINT "TemplateAttachment_pkey" PRIMARY KEY ("requirementVersionId","materialId")
);
CREATE UNIQUE INDEX "TemplateUpload_storageKey_key" ON "TemplateUpload"("storageKey");
CREATE UNIQUE INDEX "TemplateUpload_taskId_materialId_key" ON "TemplateUpload"("taskId", "materialId");
CREATE UNIQUE INDEX "TemplateAttachment_templateId_key" ON "TemplateAttachment"("templateId");
ALTER TABLE "TemplateUpload" ADD CONSTRAINT "TemplateUpload_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaterialTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateAttachment" ADD CONSTRAINT "TemplateAttachment_requirementVersionId_fkey" FOREIGN KEY ("requirementVersionId") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateAttachment" ADD CONSTRAINT "TemplateAttachment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TemplateUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER immutable_template_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON "TemplateAttachment"
FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();
CREATE FUNCTION protect_confirmed_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['state','confirmedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','confirmedAt'])
    OR (OLD.state='CONFIRMED' AND (NEW.state <> OLD.state OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt")) THEN
    RAISE EXCEPTION 'Template metadata is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_confirmed_template BEFORE UPDATE ON "TemplateUpload"
FOR EACH ROW EXECUTE FUNCTION protect_confirmed_template();
ALTER TABLE "TemplateUpload" ADD CONSTRAINT template_upload_consistency CHECK (
  (state='PENDING' AND "confirmedAt" IS NULL) OR (state='CONFIRMED' AND "confirmedAt" IS NOT NULL)
);
DO $$
DECLARE runtime_role text;
BEGIN
  IF current_user='caau_dev_owner' THEN runtime_role := 'caau_dev_app';
  ELSIF current_user='caau_test_owner' THEN runtime_role := 'caau_test_app';
  ELSE RETURN; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "TemplateUpload", "TemplateAttachment" TO %I', runtime_role);
END;
$$;

