-- Fixed-scope maintenance entrypoint. No runtime grants; deployment may grant
-- EXECUTE to a separate maintenance identity without table DELETE privileges.
CREATE FUNCTION caau_governance_retention() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE audit_count bigint; usage_count bigint; alert_count bigint;
BEGIN
  LOCK TABLE public."AuditRecord" IN ACCESS EXCLUSIVE MODE;
  ALTER TABLE public."AuditRecord" DISABLE TRIGGER audit_append_only;
  DELETE FROM public."AuditRecord" WHERE "occurredAt" < CURRENT_TIMESTAMP - INTERVAL '90 days';
  GET DIAGNOSTICS audit_count = ROW_COUNT;
  ALTER TABLE public."AuditRecord" ENABLE TRIGGER audit_append_only;
  DELETE FROM public."AiUsageCall" WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL '90 days';
  GET DIAGNOSTICS usage_count = ROW_COUNT;
  DELETE FROM public."AiQuotaBucket" WHERE "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '90 days';
  DELETE FROM public."AiSupplierBill" WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL '90 days';
  DELETE FROM public."GovernanceAlert" WHERE state='RECOVERED' AND "lastSeenAt" < CURRENT_TIMESTAMP - INTERVAL '90 days';
  GET DIAGNOSTICS alert_count = ROW_COUNT;
  INSERT INTO public."AuditRecord" (id,action,outcome,result,"requestId",context)
    VALUES(gen_random_uuid(),'governance.retention.completed','ALLOWED','SUCCESS',gen_random_uuid(),jsonb_build_object('auditDeleted',audit_count,'usageDeleted',usage_count,'alertsDeleted',alert_count));
  RETURN jsonb_build_object('auditDeleted',audit_count,'usageDeleted',usage_count,'alertsDeleted',alert_count);
END $$;
REVOKE ALL ON FUNCTION caau_governance_retention() FROM PUBLIC;
