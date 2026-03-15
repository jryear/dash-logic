-- Runtime hardening | 013_refresh_dash_views_ordered.sql

CREATE OR REPLACE FUNCTION public.refresh_dash_views_ordered()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_advisory_lock(hashtext('public.refresh_dash_views_ordered'));

  BEGIN
    REFRESH MATERIALIZED VIEW public.commitment_current_state;
    REFRESH MATERIALIZED VIEW public.reconciliation;
    REFRESH MATERIALIZED VIEW public.daily_driver;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('public.refresh_dash_views_ordered'));
      RAISE;
  END;

  PERFORM pg_advisory_unlock(hashtext('public.refresh_dash_views_ordered'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dash_views_ordered() TO dash_app;
