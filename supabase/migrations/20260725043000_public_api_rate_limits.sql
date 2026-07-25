-- SEZA POS public API abuse protection.
-- Stores only SHA-256 bucket keys. Raw IP addresses, PINs, pairing codes, and
-- device secrets are never written to this table.

CREATE TABLE IF NOT EXISTS public.public_api_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE public.public_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_public_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
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
  v_window interval;
  v_count integer;
  v_started timestamptz;
BEGIN
  IF p_scope IS NULL OR length(p_scope) < 1 OR length(p_scope) > 100 THEN
    RAISE EXCEPTION 'Invalid rate-limit scope';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Invalid rate-limit limit';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  INSERT INTO public.public_api_rate_limits AS limits (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (p_scope, p_key_hash, v_now, 1, v_now)
  ON CONFLICT (scope, key_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - v_window THEN v_now
      ELSE limits.window_started_at
    END,
    request_count = CASE
      WHEN limits.window_started_at <= v_now - v_window THEN 1
      ELSE limits.request_count + 1
    END,
    updated_at = v_now
  RETURNING request_count, window_started_at
  INTO v_count, v_started;

  allowed := v_count <= p_limit;
  remaining := greatest(0, p_limit - v_count);
  retry_after_seconds := CASE
    WHEN allowed THEN 0
    ELSE greatest(1, ceil(extract(epoch FROM ((v_started + v_window) - v_now)))::integer)
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer)
  TO service_role;

COMMENT ON TABLE public.public_api_rate_limits IS
  'Hashed fixed-window counters for public SEZA API endpoints.';
COMMENT ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer) IS
  'Atomically consumes one request from a hashed public API rate-limit bucket.';

-- Keep the table bounded. Safe to run from a daily scheduled job; this initial
-- cleanup also removes stale rows when the migration is applied.
DELETE FROM public.public_api_rate_limits
WHERE updated_at < now() - interval '7 days';
