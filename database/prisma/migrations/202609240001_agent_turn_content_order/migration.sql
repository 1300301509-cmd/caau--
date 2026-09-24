-- CAAU-060: keep complete bounded answers and assign a durable per-session order.
-- Legacy timestamp ties contain no recoverable insertion order. For those rows
-- prefer USER before ASSISTANT, then UUID only as a deterministic backfill tie-break;
-- every new pair receives an atomic sequence allocation under the session row lock.
ALTER TABLE "AgentTurn" ALTER COLUMN "content" TYPE VARCHAR(4000);
ALTER TABLE "AgentSession" ADD COLUMN "nextTurnSequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AgentTurn" ADD COLUMN "sequence" INTEGER;

WITH ordered AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "sessionId"
    ORDER BY "createdAt", CASE "role" WHEN 'USER' THEN 0 ELSE 1 END, "id"
  )::integer AS position
  FROM "AgentTurn"
)
UPDATE "AgentTurn" t SET "sequence" = ordered.position
FROM ordered WHERE t."id" = ordered."id";

UPDATE "AgentSession" s SET "nextTurnSequence" = COALESCE(
  (SELECT max(t."sequence") + 1 FROM "AgentTurn" t WHERE t."sessionId" = s."id"), 1
);
ALTER TABLE "AgentTurn" ALTER COLUMN "sequence" SET NOT NULL;
ALTER TABLE "AgentTurn" ADD CONSTRAINT agent_turn_sequence_positive CHECK ("sequence" > 0);
ALTER TABLE "AgentSession" ADD CONSTRAINT agent_session_next_turn_positive CHECK ("nextTurnSequence" > 0);
DROP INDEX "AgentTurn_sessionId_createdAt_idx";
CREATE UNIQUE INDEX "AgentTurn_sessionId_sequence_key" ON "AgentTurn"("sessionId", "sequence");
