-- =====================================================================
-- Store-scoped PIN login + device pairing
-- =====================================================================

-- 1) device_registrations ---------------------------------------------
CREATE TABLE public.device_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  platform text,
  paired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paired_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_registrations_store ON public.device_registrations(store_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_registrations TO authenticated;
GRANT ALL ON public.device_registrations TO service_role;

ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_registrations_manager_read
  ON public.device_registrations FOR SELECT TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

CREATE POLICY device_registrations_manager_write
  ON public.device_registrations FOR ALL TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

CREATE TRIGGER device_registrations_updated_at
  BEFORE UPDATE ON public.device_registrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) device_pairing_codes ---------------------------------------------
CREATE TABLE public.device_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_device_id uuid REFERENCES public.device_registrations(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_pairing_codes_store ON public.device_pairing_codes(store_id, expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_pairing_codes TO authenticated;
GRANT ALL ON public.device_pairing_codes TO service_role;

ALTER TABLE public.device_pairing_codes ENABLE ROW LEVEL SECURITY;

-- Only the creator (owner/admin/manager who minted the code) may see or revoke it.
-- The code hash never leaves the server anyway, but this keeps the audit trail
-- scoped and prevents siblings from seeing each other's outstanding codes.
CREATE POLICY device_pairing_codes_owner_read
  ON public.device_pairing_codes FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    AND store_id = public.current_store_id()
  );

CREATE POLICY device_pairing_codes_manager_insert
  ON public.device_pairing_codes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

CREATE POLICY device_pairing_codes_creator_delete
  ON public.device_pairing_codes FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- 3) profiles.pin_fingerprint ------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_fingerprint text;

-- Same-store PIN uniqueness for ACTIVE employees only. Legacy null-fingerprint
-- rows are ignored so existing employees keep working until their next PIN
-- change or successful login populates the fingerprint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_store_pin_fingerprint
  ON public.profiles(store_id, pin_fingerprint)
  WHERE status = 'active' AND pin_fingerprint IS NOT NULL;

-- 4) Same-store conflict check (safe for authenticated) ----------------
CREATE OR REPLACE FUNCTION public.pos_pin_conflict_check(
  _store_id uuid,
  _fingerprint text,
  _exclude_user uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE store_id = _store_id
      AND status = 'active'
      AND pin_fingerprint = _fingerprint
      AND (_exclude_user IS NULL OR id <> _exclude_user)
  );
$$;

-- Restrict to callers that can already see this store's employees. The
-- caller passes only the opaque fingerprint (never the PIN).
REVOKE ALL ON FUNCTION public.pos_pin_conflict_check(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_pin_conflict_check(uuid, text, uuid) TO authenticated, service_role;

-- 5) Store-scoped PIN candidate lookup (service-role only) -------------
CREATE OR REPLACE FUNCTION public.pos_find_pin_candidates(
  _store_id uuid,
  _fingerprint text
) RETURNS TABLE(id uuid, email text, pin_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.pin_hash
    FROM public.profiles p
   WHERE p.store_id = _store_id
     AND p.status = 'active'
     AND p.pin_fingerprint = _fingerprint
     AND p.pin_hash IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.pos_find_pin_candidates(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_find_pin_candidates(uuid, text) TO service_role;

-- 6) Legacy fallback lookup: rows at this store that STILL have no      -
--    fingerprint. Used only when the fingerprint match returns nothing  -
--    so migrated + unmigrated employees can coexist during rollout.     -
CREATE OR REPLACE FUNCTION public.pos_list_unfingerprinted(_store_id uuid)
RETURNS TABLE(id uuid, email text, pin_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.pin_hash
    FROM public.profiles p
   WHERE p.store_id = _store_id
     AND p.status = 'active'
     AND p.pin_hash IS NOT NULL
     AND p.pin_fingerprint IS NULL;
$$;
REVOKE ALL ON FUNCTION public.pos_list_unfingerprinted(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_list_unfingerprinted(uuid) TO service_role;
