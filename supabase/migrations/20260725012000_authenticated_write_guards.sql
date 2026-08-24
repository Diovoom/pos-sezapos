-- Backstop limits for browser/APK writes that use the Supabase data API
-- directly. HTTP/server-function limits remain the first layer. These triggers
-- protect key tables even if a caller bypasses the normal SEZA UI.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.enforce_authenticated_write_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_limit integer := TG_ARGV[0]::integer;
  v_window integer := TG_ARGV[1]::integer;
  v_block integer := TG_ARGV[2]::integer;
  v_key text;
  v_allowed boolean;
  v_remaining integer;
  v_retry integer;
BEGIN
  -- Service-role/internal work has no auth.uid() and is already protected by
  -- the server endpoint that invoked it.
  IF v_actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_key := encode(
    digest(v_actor::text || ':' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || TG_OP, 'sha256'),
    'hex'
  );

  SELECT allowed, remaining, retry_after_seconds
    INTO v_allowed, v_remaining, v_retry
  FROM public.consume_api_rate_limit(
    v_key,
    'db.write.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    v_limit,
    v_window,
    v_block
  );

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'RATE_LIMITED',
      DETAIL = 'retry_after_seconds=' || GREATEST(1, COALESCE(v_retry, 1));
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_authenticated_write_rate_limit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_authenticated_write_rate_limit()
  TO service_role;

DO $$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN
    SELECT * FROM (VALUES
      ('products',             2000, 3600,  300),
      ('categories',            300, 3600,  300),
      ('customers',             600, 3600,  300),
      ('support_tickets',          5, 3600, 3600),
      ('support_ticket_notes',   120, 3600,  600),
      ('cash_movements',         120, 3600,  600),
      ('time_entries',           240, 3600,  600),
      ('refunds',                 60, 3600, 1800),
      ('legal_acceptances',       20, 3600, 3600)
    ) AS limits(table_name, max_requests, window_seconds, block_seconds)
  LOOP
    IF to_regclass('public.' || v_item.table_name) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.%I',
        'seza_write_limit_' || v_item.table_name,
        v_item.table_name
      );
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION public.enforce_authenticated_write_rate_limit(%L, %L, %L)',
        'seza_write_limit_' || v_item.table_name,
        v_item.table_name,
        v_item.max_requests,
        v_item.window_seconds,
        v_item.block_seconds
      );
    END IF;
  END LOOP;
END
$$;
