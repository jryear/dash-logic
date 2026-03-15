-- Runtime hardening | 012_runtime_invariants.sql

CREATE OR REPLACE FUNCTION public.assert_dash_runtime_invariants()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH required_rpcs(name, is_critical) AS (
    VALUES
      ('resolve_supplier', true),
      ('resolve_sku', true),
      ('get_commitment_status', true),
      ('list_open_commitments', true),
      ('get_reconciliation_deltas', true),
      ('get_recent_communications', true),
      ('get_fulfillment_state', true),
      ('get_payment_obligations', true),
      ('get_evidence_for_claim', true),
      ('search_evidence_text', true),
      ('search_entities_fuzzy', true),
      ('resolve_po_number', true),
      ('refresh_dash_views_ordered', true)
  ),
  rpc_checks AS (
    SELECT jsonb_build_object(
      'name', 'rpc:' || rr.name,
      'ok', EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = rr.name
      ),
      'critical', rr.is_critical,
      'remediation', 'Apply the latest RPC/ops migrations.'
    ) AS check_row
    FROM required_rpcs rr
  ),
  schema_check AS (
    SELECT jsonb_build_object(
      'name', 'postgrest:required_schemas',
      'ok',
      EXISTS (
        SELECT 1
        FROM pg_db_role_setting s
        JOIN pg_roles r ON r.oid = s.setrole
        WHERE r.rolname = 'authenticator'
          AND EXISTS (
            SELECT 1
            FROM unnest(s.setconfig) cfg
            WHERE cfg LIKE 'pgrst.db_schemas=%'
              AND cfg LIKE '%public%'
              AND cfg LIKE '%dash_private%'
          )
      ),
      'critical', true,
      'remediation', 'ALTER ROLE authenticator SET pgrst.db_schemas = ''public, dash_private, storage, graphql_public'' and reload PostgREST.'
    ) AS check_row
  ),
  boundary_checks AS (
    SELECT * FROM (
      VALUES
        (
          jsonb_build_object(
            'name', 'boundary:dash_private_tables_exist',
            'ok',
            EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'dash_private'
                AND table_name = 'commitment_events'
            ) AND EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'dash_private'
                AND table_name = 'fulfillment_events'
            ) AND EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'dash_private'
                AND table_name = 'review_events'
            ),
            'critical', true,
            'remediation', 'Reapply event table migrations.'
          )
        ),
        (
          jsonb_build_object(
            'name', 'boundary:no_public_event_tables',
            'ok',
            NOT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name IN ('commitment_events', 'fulfillment_events', 'review_events')
            ),
            'critical', true,
            'remediation', 'Event tables must live only in dash_private.'
          )
        ),
        (
          jsonb_build_object(
            'name', 'boundary:no_public_role_reads_from_dash_private',
            'ok',
            NOT has_table_privilege('anon', 'dash_private.commitment_events', 'SELECT')
            AND NOT has_table_privilege('anon', 'dash_private.fulfillment_events', 'SELECT')
            AND NOT has_table_privilege('anon', 'dash_private.review_events', 'SELECT')
            AND NOT has_table_privilege('authenticated', 'dash_private.commitment_events', 'SELECT')
            AND NOT has_table_privilege('authenticated', 'dash_private.fulfillment_events', 'SELECT')
            AND NOT has_table_privilege('authenticated', 'dash_private.review_events', 'SELECT'),
            'critical', true,
            'remediation', 'Revoke direct anon/authenticated read access from dash_private event tables.'
          )
        )
    ) AS t(check_row)
  ),
  privilege_checks AS (
    SELECT * FROM (
      VALUES
        (
          jsonb_build_object(
            'name', 'privileges:dash_app_commitment_events_append_only',
            'ok',
            has_table_privilege('dash_app', 'dash_private.commitment_events', 'SELECT')
            AND has_table_privilege('dash_app', 'dash_private.commitment_events', 'INSERT')
            AND NOT has_table_privilege('dash_app', 'dash_private.commitment_events', 'UPDATE')
            AND NOT has_table_privilege('dash_app', 'dash_private.commitment_events', 'DELETE'),
            'critical', true,
            'remediation', 'Restore dash_app append-only grants on dash_private.commitment_events.'
          )
        ),
        (
          jsonb_build_object(
            'name', 'privileges:dash_app_fulfillment_events_append_only',
            'ok',
            has_table_privilege('dash_app', 'dash_private.fulfillment_events', 'SELECT')
            AND has_table_privilege('dash_app', 'dash_private.fulfillment_events', 'INSERT')
            AND NOT has_table_privilege('dash_app', 'dash_private.fulfillment_events', 'UPDATE')
            AND NOT has_table_privilege('dash_app', 'dash_private.fulfillment_events', 'DELETE'),
            'critical', true,
            'remediation', 'Restore dash_app append-only grants on dash_private.fulfillment_events.'
          )
        ),
        (
          jsonb_build_object(
            'name', 'privileges:dash_app_review_events_append_only',
            'ok',
            has_table_privilege('dash_app', 'dash_private.review_events', 'SELECT')
            AND has_table_privilege('dash_app', 'dash_private.review_events', 'INSERT')
            AND NOT has_table_privilege('dash_app', 'dash_private.review_events', 'UPDATE')
            AND NOT has_table_privilege('dash_app', 'dash_private.review_events', 'DELETE'),
            'critical', true,
            'remediation', 'Restore dash_app append-only grants on dash_private.review_events.'
          )
        )
    ) AS t(check_row)
  ),
  all_checks AS (
    SELECT check_row FROM rpc_checks
    UNION ALL
    SELECT check_row FROM schema_check
    UNION ALL
    SELECT check_row FROM boundary_checks
    UNION ALL
    SELECT check_row FROM privilege_checks
  ),
  aggregated AS (
    SELECT
      COALESCE(jsonb_agg(check_row ORDER BY check_row->>'name'), '[]'::jsonb) AS checks,
      bool_and(COALESCE((check_row->>'ok')::boolean, false)) AS ok,
      bool_and(
        CASE
          WHEN COALESCE((check_row->>'critical')::boolean, false) AND NOT COALESCE((check_row->>'ok')::boolean, false)
            THEN false
          ELSE true
        END
      ) AS critical_ok
    FROM all_checks
  )
  SELECT jsonb_build_object(
    'ok', aggregated.ok,
    'critical_ok', aggregated.critical_ok,
    'checks', aggregated.checks
  )
  FROM aggregated;
$$;
