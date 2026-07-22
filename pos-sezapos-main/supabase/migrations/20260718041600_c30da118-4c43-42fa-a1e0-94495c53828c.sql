
-- 1) Lock down SECURITY DEFINER trigger function from being executable by API roles.
REVOKE EXECUTE ON FUNCTION public.tg_enforce_role_exclusivity() FROM PUBLIC, anon, authenticated;

-- 2) Tighten sms_settings access: only owners/admins can read the row that
--    contains provider credentials; managers no longer have SELECT.
DROP POLICY IF EXISTS sms_settings_select_store ON public.sms_settings;
CREATE POLICY sms_settings_select_store
  ON public.sms_settings
  FOR SELECT
  TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  );

-- Defense-in-depth: even if a future policy re-widens row access, forbid the
-- raw credentials column from being read by API roles. Only service_role
-- (server-side code) can read the raw secret bag.
REVOKE SELECT (credentials) ON public.sms_settings FROM anon, authenticated;
GRANT SELECT (credentials) ON public.sms_settings TO service_role;
