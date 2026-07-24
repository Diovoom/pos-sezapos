-- Immutable, versioned legal-policy acceptance records.
-- The client cannot choose another user or store: both values come from auth/session helpers.

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  terms_version text NOT NULL CHECK (btrim(terms_version) <> ''),
  privacy_version text NOT NULL CHECK (btrim(privacy_version) <> ''),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'setup_wizard' CHECK (source IN ('signup', 'setup_wizard', 'policy_update')),
  CONSTRAINT legal_acceptances_policy_version_unique
    UNIQUE (user_id, store_id, terms_version, privacy_version)
);

CREATE INDEX IF NOT EXISTS legal_acceptances_store_recorded_idx
  ON public.legal_acceptances (store_id, recorded_at DESC);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_acceptances_select_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_select_own
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      store_id = public.current_store_id()
      AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    )
  );

-- No direct INSERT/UPDATE/DELETE policy is intentionally provided.
-- Acceptance is recorded through the security-definer RPC below and remains immutable.

CREATE OR REPLACE FUNCTION public.record_legal_acceptance(
  p_terms_version text,
  p_privacy_version text,
  p_accepted_at timestamptz DEFAULT now(),
  p_source text DEFAULT 'setup_wizard'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid := public.current_store_id();
  v_id uuid;
  v_accepted_at timestamptz := COALESCE(p_accepted_at, now());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No active store is assigned' USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(p_terms_version, '')) = ''
     OR btrim(COALESCE(p_privacy_version, '')) = '' THEN
    RAISE EXCEPTION 'Policy versions are required' USING ERRCODE = '22023';
  END IF;

  IF p_source NOT IN ('signup', 'setup_wizard', 'policy_update') THEN
    RAISE EXCEPTION 'Invalid legal acceptance source' USING ERRCODE = '22023';
  END IF;

  -- Reject timestamps that could make an acceptance appear older or newer than it really is.
  IF v_accepted_at < now() - interval '24 hours' OR v_accepted_at > now() + interval '5 minutes' THEN
    v_accepted_at := now();
  END IF;

  INSERT INTO public.legal_acceptances (
    user_id,
    store_id,
    terms_version,
    privacy_version,
    accepted_at,
    source
  )
  VALUES (
    v_user_id,
    v_store_id,
    btrim(p_terms_version),
    btrim(p_privacy_version),
    v_accepted_at,
    p_source
  )
  ON CONFLICT (user_id, store_id, terms_version, privacy_version)
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id
      INTO v_id
      FROM public.legal_acceptances
     WHERE user_id = v_user_id
       AND store_id = v_store_id
       AND terms_version = btrim(p_terms_version)
       AND privacy_version = btrim(p_privacy_version);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_legal_acceptance(text, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(text, text, timestamptz, text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.legal_acceptances FROM authenticated;
GRANT SELECT ON public.legal_acceptances TO authenticated;
