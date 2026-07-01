
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS currency_symbol text,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_logo_url text,
  ADD COLUMN IF NOT EXISTS thank_you_message text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;
