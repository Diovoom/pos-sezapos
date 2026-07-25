-- The original admin login limiter stored raw email/IP/user-agent values.
-- SEZA now uses api_rate_limit_buckets, which stores only SHA-256 identifiers,
-- and successful logins are recorded in audit_log. Lock and clear the legacy
-- table so historical personal identifiers cannot be queried from the client.

DO $$
BEGIN
  IF to_regclass('public.admin_login_attempts') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_login_attempts FROM anon, authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.admin_login_attempts TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "Super admins can read login attempts" ON public.admin_login_attempts';
    EXECUTE 'TRUNCATE TABLE public.admin_login_attempts';
  END IF;
END
$$;
