
-- 1. Extend sales with customer contact fields
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_email text;

-- 2. Per-store SMS provider settings
CREATE TABLE IF NOT EXISTS public.sms_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio',
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  sender_id text,
  default_country text NOT NULL DEFAULT 'US',
  enabled boolean NOT NULL DEFAULT false,
  last_status text,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_settings TO authenticated;
GRANT ALL ON public.sms_settings TO service_role;

ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_settings_select_store" ON public.sms_settings
  FOR SELECT TO authenticated
  USING (store_id = public.current_store_id()
         AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role]));

CREATE POLICY "sms_settings_upsert_store" ON public.sms_settings
  FOR INSERT TO authenticated
  WITH CHECK (store_id = public.current_store_id()
              AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role]));

CREATE POLICY "sms_settings_update_store" ON public.sms_settings
  FOR UPDATE TO authenticated
  USING (store_id = public.current_store_id()
         AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role]));

CREATE POLICY "sms_settings_delete_store" ON public.sms_settings
  FOR DELETE TO authenticated
  USING (store_id = public.current_store_id()
         AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role]));

CREATE TRIGGER sms_settings_set_updated_at
  BEFORE UPDATE ON public.sms_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. SMS send log (per sale)
CREATE TABLE IF NOT EXISTS public.sms_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  message_body text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_send_log_store_created_idx
  ON public.sms_send_log (store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sms_send_log_idem_idx
  ON public.sms_send_log (store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT ON public.sms_send_log TO authenticated;
GRANT ALL ON public.sms_send_log TO service_role;

ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_send_log_select_store" ON public.sms_send_log
  FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());
