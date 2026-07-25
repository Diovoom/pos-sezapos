-- SEZA API abuse protection.
-- Stores hashed identifiers only. Raw IP addresses, emails, device secrets,
-- passwords, and PINs are never written to this table.

CREATE TABLE IF NOT EXISTS public.api_rate_limit_buckets (
  key_hash text PRIMARY KEY,
  scope text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limit_buckets FROM anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limit_buckets TO service_role;

CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_updated_idx
  ON public.api_rate_limit_buckets (updated_at);
CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_scope_idx
  ON public.api_rate_limit_buckets (scope, updated_at DESC);

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_key_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer DEFAULT 0
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket public.api_rate_limit_buckets%ROWTYPE;
  v_window interval;
  v_block interval;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 OR length(p_key_hash) > 128 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_scope IS NULL OR length(btrim(p_scope)) = 0 OR length(p_scope) > 120 THEN
    RAISE EXCEPTION 'Invalid rate-limit scope';
  END IF;
  IF p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid rate-limit maximum';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  IF p_block_seconds < 0 OR p_block_seconds > 604800 THEN
    RAISE EXCEPTION 'Invalid rate-limit block duration';
  END IF;

  v_window := make_interval(secs => p_window_seconds);
  v_block := make_interval(secs => p_block_seconds);

  INSERT INTO public.api_rate_limit_buckets (
    key_hash, scope, window_started_at, request_count, blocked_until, updated_at
  ) VALUES (
    p_key_hash, p_scope, v_now, 0, NULL, v_now
  )
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_bucket
  FROM public.api_rate_limit_buckets
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF v_bucket.blocked_until IS NOT NULL AND v_bucket.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0,
      GREATEST(1, ceil(extract(epoch FROM (v_bucket.blocked_until - v_now)))::integer);
    RETURN;
  END IF;

  IF v_bucket.window_started_at + v_window <= v_now THEN
    UPDATE public.api_rate_limit_buckets
    SET scope = p_scope,
        window_started_at = v_now,
        request_count = 1,
        blocked_until = NULL,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT true, GREATEST(0, p_limit - 1), 0;
    RETURN;
  END IF;

  IF v_bucket.request_count >= p_limit THEN
    UPDATE public.api_rate_limit_buckets
    SET blocked_until = CASE
          WHEN p_block_seconds > 0 THEN v_now + v_block
          ELSE v_bucket.window_started_at + v_window
        END,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT false, 0,
      GREATEST(
        1,
        ceil(extract(epoch FROM (
          CASE WHEN p_block_seconds > 0 THEN v_now + v_block
               ELSE v_bucket.window_started_at + v_window END
          - v_now
        )))::integer
      );
    RETURN;
  END IF;

  UPDATE public.api_rate_limit_buckets
  SET scope = p_scope,
      request_count = request_count + 1,
      blocked_until = NULL,
      updated_at = v_now
  WHERE key_hash = p_key_hash
  RETURNING * INTO v_bucket;

  RETURN QUERY SELECT true, GREATEST(0, p_limit - v_bucket.request_count), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limit_buckets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.api_rate_limit_buckets
  WHERE updated_at < now() - interval '7 days'
    AND (blocked_until IS NULL OR blocked_until < now() - interval '1 day');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_api_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limit_buckets() TO service_role;

COMMENT ON TABLE public.api_rate_limit_buckets IS
  'Server-only, hashed API abuse counters. Never stores raw personal identifiers.';
