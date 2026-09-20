CREATE TYPE "EventSupplyStatus" AS ENUM ('TO_PREPARE', 'PREPARING', 'READY', 'SHORTAGE');
CREATE TYPE "EventSupplyPhotoState" AS ENUM ('PENDING', 'CONFIRMED', 'REMOVED');

CREATE TABLE "EventSupplyItem" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "notes" VARCHAR(2000) NOT NULL DEFAULT '',
  "status" "EventSupplyStatus" NOT NULL DEFAULT 'TO_PREPARE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventSupplyItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventSupplyItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_supply_quantity CHECK ("quantity" > 0 AND "quantity" <= 1000000),
  CONSTRAINT event_supply_revision CHECK ("revision" > 0)
);

CREATE TABLE "EventSupplyPhoto" (
  "id" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "originalName" VARCHAR(180) NOT NULL,
  "extension" VARCHAR(8) NOT NULL,
  "expectedBytes" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "objectKey" UUID NOT NULL,
  "state" "EventSupplyPhotoState" NOT NULL DEFAULT 'PENDING',
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMPTZ(3),
  "removedAt" TIMESTAMPTZ(3),
  CONSTRAINT "EventSupplyPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventSupplyPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EventSupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_supply_photo_bytes CHECK ("expectedBytes" > 0 AND "expectedBytes" <= 10485760),
  CONSTRAINT event_supply_photo_extension CHECK ("extension" IN ('png','jpg','jpeg')),
  CONSTRAINT event_supply_photo_sha CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT event_supply_photo_times CHECK (("state"='PENDING' AND "confirmedAt" IS NULL AND "removedAt" IS NULL) OR ("state"='CONFIRMED' AND "confirmedAt" IS NOT NULL AND "removedAt" IS NULL) OR ("state"='REMOVED' AND "confirmedAt" IS NOT NULL AND "removedAt" IS NOT NULL))
);

CREATE TABLE "EventSupplyHistory" (
  "id" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actorId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventSupplyHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventSupplyHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EventSupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT event_supply_history_snapshot CHECK (jsonb_typeof("snapshot")='object')
);

CREATE INDEX "EventSupplyItem_eventId_createdAt_idx" ON "EventSupplyItem"("eventId", "createdAt");
CREATE UNIQUE INDEX "EventSupplyPhoto_objectKey_key" ON "EventSupplyPhoto"("objectKey");
CREATE INDEX "EventSupplyPhoto_itemId_state_idx" ON "EventSupplyPhoto"("itemId", "state");
CREATE UNIQUE INDEX "EventSupplyHistory_itemId_revision_key" ON "EventSupplyHistory"("itemId", "revision");

DO $$
DECLARE runtime_role text;
BEGIN
 runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
 IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "EventSupplyItem", "EventSupplyPhoto" TO %I', runtime_role);
 EXECUTE format('GRANT SELECT, INSERT ON "EventSupplyHistory" TO %I', runtime_role);
END $$;

CREATE TRIGGER immutable_event_supply_history BEFORE UPDATE OR DELETE OR TRUNCATE ON "EventSupplyHistory" FOR EACH STATEMENT EXECUTE FUNCTION reject_material_history_mutation();

CREATE FUNCTION protect_event_supply_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW."eventId"<>OLD."eventId" OR NEW."createdBy"<>OLD."createdBy" OR NEW."createdAt"<>OLD."createdAt" OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Invalid event supply identity or revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_supply_item_identity BEFORE UPDATE ON "EventSupplyItem" FOR EACH ROW EXECUTE FUNCTION protect_event_supply_item();

CREATE FUNCTION protect_event_supply_photo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW."itemId",NEW."originalName",NEW.extension,NEW."expectedBytes",NEW.sha256,NEW."objectKey",NEW."createdBy",NEW."createdAt") IS DISTINCT FROM
    (OLD.id,OLD."itemId",OLD."originalName",OLD.extension,OLD."expectedBytes",OLD.sha256,OLD."objectKey",OLD."createdBy",OLD."createdAt") THEN
   RAISE EXCEPTION 'Event supply photo identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NOT ((OLD.state='PENDING' AND NEW.state='CONFIRMED') OR (OLD.state='CONFIRMED' AND NEW.state='REMOVED')) THEN
   RAISE EXCEPTION 'Invalid event supply photo transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_supply_photo_identity BEFORE UPDATE ON "EventSupplyPhoto" FOR EACH ROW EXECUTE FUNCTION protect_event_supply_photo();
