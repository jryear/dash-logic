-- Milestone 0 | 007_roles_and_privileges.sql | Traces to: ARCHITECTURE-dash.md §5.5

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'dash_app'
  ) THEN
    CREATE ROLE dash_app;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dash_app;
GRANT USAGE ON SCHEMA dash_private TO dash_app;

GRANT SELECT, INSERT ON TABLE dash_private.commitment_events TO dash_app;
GRANT SELECT, INSERT ON TABLE dash_private.fulfillment_events TO dash_app;
GRANT SELECT, INSERT ON TABLE dash_private.review_events TO dash_app;

REVOKE UPDATE, DELETE ON TABLE dash_private.commitment_events FROM dash_app;
REVOKE UPDATE, DELETE ON TABLE dash_private.fulfillment_events FROM dash_app;
REVOKE UPDATE, DELETE ON TABLE dash_private.review_events FROM dash_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE artifacts TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE evidence_spans TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partners TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contacts TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE skus TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE relationships TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE communications TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE processing_jobs TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE action_runs TO dash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE action_outbox TO dash_app;

GRANT SELECT ON TABLE public.commitment_current_state TO dash_app;
GRANT SELECT ON TABLE public.reconciliation TO dash_app;
GRANT SELECT ON TABLE public.daily_driver TO dash_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dash_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dash_private TO dash_app;
