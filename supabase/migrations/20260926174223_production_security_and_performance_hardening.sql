-- Production hardening verified against the live SEZA Supabase project on 2026-09-26.
-- This migration mirrors the database changes already applied in production so
-- source control and the live schema do not drift apart.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Supabase flags extensions installed in public. pg_trgm is relocatable and
-- the project search_path already includes extensions, so move it without
-- changing the existing trigram index behavior.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
      AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END
$$;

-- These tables are internal/service-role-only. Keep RLS explicit instead of
-- relying on the absence of policies, which is secure but ambiguous to audits.
DROP POLICY IF EXISTS business_trial_registry_internal_only ON public.business_trial_registry;
CREATE POLICY business_trial_registry_internal_only
ON public.business_trial_registry
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS passkey_challenges_internal_only ON public.passkey_challenges;
CREATE POLICY passkey_challenges_internal_only
ON public.passkey_challenges
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Current POS pairing is handled by the server-side /api/public/pos/pair-device
-- route with service-role access. Do not expose the legacy SECURITY DEFINER RPC
-- directly to anonymous or signed-in PostgREST clients.
REVOKE ALL ON FUNCTION public.consume_pos_pairing_code(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pos_pairing_code(text, text, text, text)
  TO service_role;

-- Trigger functions do not need to be directly executable by API clients.
REVOKE ALL ON FUNCTION public.tg_protect_super_admin_role()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_protect_super_admin_role()
  TO service_role;

-- Avoid reevaluating auth.uid() once per row while preserving policy semantics.
DROP POLICY IF EXISTS admin_permissions_platform_staff_read ON public.admin_permissions;
CREATE POLICY admin_permissions_platform_staff_read
ON public.admin_permissions
FOR SELECT
TO authenticated
USING (public.is_platform_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS legal_acceptances_select_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_select_own
ON public.legal_acceptances
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    store_id = public.current_store_id()
    AND public.has_any_role(
      (SELECT auth.uid()),
      ARRAY['owner'::public.app_role, 'admin'::public.app_role]
    )
  )
);

DROP POLICY IF EXISTS passkeys_select_own ON public.passkey_credentials;
CREATE POLICY passkeys_select_own
ON public.passkey_credentials
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS passkeys_update_own ON public.passkey_credentials;
CREATE POLICY passkeys_update_own
ON public.passkey_credentials
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS passkeys_delete_own ON public.passkey_credentials;
CREATE POLICY passkeys_delete_own
ON public.passkey_credentials
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Cover foreign keys used by deletes/joins so production load does not turn
-- referential checks into avoidable sequential scans.
CREATE INDEX IF NOT EXISTS business_trial_registry_first_store_id_idx
  ON public.business_trial_registry(first_store_id);
CREATE INDEX IF NOT EXISTS business_trial_registry_first_user_id_idx
  ON public.business_trial_registry(first_user_id);
CREATE INDEX IF NOT EXISTS legal_acceptances_store_id_idx
  ON public.legal_acceptances(store_id);
CREATE INDEX IF NOT EXISTS passkey_challenges_user_id_idx
  ON public.passkey_challenges(user_id);
CREATE INDEX IF NOT EXISTS platform_settings_updated_by_idx
  ON public.platform_settings(updated_by);
CREATE INDEX IF NOT EXISTS signup_risk_events_store_id_idx
  ON public.signup_risk_events(store_id);
CREATE INDEX IF NOT EXISTS signup_risk_events_user_id_idx
  ON public.signup_risk_events(user_id);
CREATE INDEX IF NOT EXISTS stores_country_code_idx
  ON public.stores(country_code);
CREATE INDEX IF NOT EXISTS support_tickets_chat_ended_by_idx
  ON public.support_tickets(chat_ended_by);
