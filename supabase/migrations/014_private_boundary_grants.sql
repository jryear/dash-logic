-- Runtime hardening | 014_private_boundary_grants.sql

REVOKE USAGE ON SCHEMA dash_private FROM anon, authenticated;

REVOKE ALL ON TABLE dash_private.commitment_events FROM anon, authenticated;
REVOKE ALL ON TABLE dash_private.fulfillment_events FROM anon, authenticated;
REVOKE ALL ON TABLE dash_private.review_events FROM anon, authenticated;

GRANT USAGE ON SCHEMA dash_private TO dash_app;
GRANT USAGE ON SCHEMA dash_private TO service_role;
