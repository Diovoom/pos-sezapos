-- 1) STORES: merchant roles may only edit business-profile columns
DROP POLICY IF EXISTS stores_modify ON public.stores;
CREATE POLICY stores_modify ON public.stores
  FOR UPDATE TO authenticated
  USING (id = public.current_store_id() AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role]))
  WITH CHECK (id = public.current_store_id() AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role]));

REVOKE INSERT, UPDATE, DELETE ON public.stores FROM authenticated;
REVOKE ALL ON public.stores FROM anon;
GRANT SELECT ON public.stores TO authenticated;
GRANT UPDATE (
  name, address, phone, tax_rate, currency, logo_url, updated_at,
  receipt_header, receipt_footer, return_policy, email, business_type,
  city, state, zip, country, website, tax_id, language, time_zone,
  date_format, business_hours, setup_completed_at, setup_state,
  currency_symbol, tax_inclusive, receipt_logo_url, thank_you_message,
  social_links, age_verification_settings, country_code, region_code,
  locale, paper_size, address_format_override, phone_format_override,
  starting_cash_float, show_expected_before_count, variance_alert_threshold,
  allow_cashier_quick_add, pos_display_name
) ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;

-- 2) DEVICE REGISTRATIONS: secret_hash is service-role only
REVOKE INSERT, UPDATE ON public.device_registrations FROM authenticated;
REVOKE ALL ON public.device_registrations FROM anon;
GRANT INSERT (store_id, label, status, platform, paired_by, paired_at, last_seen_at,
              revoked_at, revoked_by, revoke_reason, status_snapshot, app_version, last_sync_at)
  ON public.device_registrations TO authenticated;
GRANT UPDATE (label, status, platform, last_seen_at, revoked_at, revoked_by,
              revoke_reason, updated_at, status_snapshot, app_version, last_sync_at)
  ON public.device_registrations TO authenticated;
GRANT ALL ON public.device_registrations TO service_role;

CREATE OR REPLACE FUNCTION public.tg_device_registrations_protect_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.secret_hash IS NOT NULL THEN
      RAISE EXCEPTION 'Device secrets can only be issued by the pairing service';
    END IF;
  ELSIF NEW.secret_hash IS DISTINCT FROM OLD.secret_hash THEN
    RAISE EXCEPTION 'Device secrets can only be issued by the pairing service';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_device_registrations_protect_secret() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS device_registrations_protect_secret ON public.device_registrations;
CREATE TRIGGER device_registrations_protect_secret
  BEFORE INSERT OR UPDATE ON public.device_registrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_device_registrations_protect_secret();