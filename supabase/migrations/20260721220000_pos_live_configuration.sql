-- Live owner-dashboard -> Android POS configuration and register health.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pos_display_name text;

ALTER TABLE public.device_registrations
  ADD COLUMN IF NOT EXISTS status_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

COMMENT ON COLUMN public.stores.pos_display_name IS
  'Short fallback text/initials shown where a merchant logo would normally appear.';
COMMENT ON COLUMN public.device_registrations.status_snapshot IS
  'Latest read-only Android POS health snapshot (network, printer, scanner, drawer, terminal and sync state).';

-- DELETE events must include store_id so filtered permission subscriptions
-- receive immediate revocations as well as grants.
ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;

-- Realtime drives immediate permission, branding, language and health refreshes.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.device_registrations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_terminals;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
