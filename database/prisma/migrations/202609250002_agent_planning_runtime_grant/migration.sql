-- Forward-only repair: the planning table is created by the preceding migration,
-- but the runtime role does not inherit grants on new public tables.
DO $$ DECLARE runtime_role text; BEGIN
  runtime_role := CASE WHEN current_user='caau_dev_owner' THEN 'caau_dev_app' WHEN current_user='caau_test_owner' THEN 'caau_test_app' ELSE NULL END;
  IF runtime_role IS NULL THEN RAISE EXCEPTION 'Unknown migration owner'; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON "AgentPlanningRequest" TO %I', runtime_role);
END $$;
