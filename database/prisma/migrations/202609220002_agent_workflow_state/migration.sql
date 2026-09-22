ALTER TABLE "AgentTask"
  ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "pendingFields" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "candidateEventIds" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "candidateMatchIds" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "AgentTask" DROP CONSTRAINT agent_task_step;
ALTER TABLE "AgentTask" ADD CONSTRAINT agent_task_step CHECK (step IN ('LOCATE_EVENT','LOCATE_MATCH','WAITING_PARAMETERS','PREVIEW_READY','STALE','FAILED'));
ALTER TABLE "AgentTask" ADD CONSTRAINT agent_task_workflow_state CHECK (
  revision > 0 AND
  jsonb_typeof(parameters) = 'object' AND
  jsonb_typeof("pendingFields") = 'array' AND
  jsonb_typeof("candidateEventIds") = 'array' AND
  jsonb_typeof("candidateMatchIds") = 'array'
);
