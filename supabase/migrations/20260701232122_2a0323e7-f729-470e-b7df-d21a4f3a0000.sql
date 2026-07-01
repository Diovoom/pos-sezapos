
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS age_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_age smallint,
  ADD COLUMN IF NOT EXISTS age_category text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS age_verification_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.age_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cashier_email text,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  min_age smallint NOT NULL,
  method text NOT NULL,                  -- id_scan | manual | override
  result text NOT NULL,                  -- approved | rejected | expired_id | underage
  customer_dob date,
  id_expires_on date,
  id_document_last4 text,                -- masked doc number
  id_full_name_masked text,              -- e.g. "John D."
  manager_override_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  override_reason text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.age_verifications TO authenticated;
GRANT ALL ON public.age_verifications TO service_role;
ALTER TABLE public.age_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read age verifications"
  ON public.age_verifications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Cashiers can insert their own age verifications"
  ON public.age_verifications FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid());

CREATE INDEX IF NOT EXISTS age_verifications_store_created_idx
  ON public.age_verifications (store_id, created_at DESC);
