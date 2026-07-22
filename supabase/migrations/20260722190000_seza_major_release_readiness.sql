-- SEZA POS major release readiness
-- Customer CRM, split-payment ledger, restaurant workflow, public API keys,
-- and configurable integration settings. All records remain tenant-scoped.

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  loyalty_points integer NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  total_spent numeric NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
  visit_count integer NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  marketing_email boolean NOT NULL DEFAULT false,
  marketing_sms boolean NOT NULL DEFAULT false,
  last_visit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_store_name_idx ON public.customers(store_id, lower(name));
CREATE INDEX IF NOT EXISTS customers_store_phone_idx ON public.customers(store_id, phone);
CREATE INDEX IF NOT EXISTS customers_store_email_idx ON public.customers(store_id, lower(email));
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_tenant_access" ON public.customers;
CREATE POLICY "customers_tenant_access" ON public.customers
FOR ALL TO authenticated
USING (store_id = public.current_store_id())
WITH CHECK (store_id = public.current_store_id());

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cash','card','tap_to_pay','manual_card','gift_card','other')),
  amount numeric NOT NULL CHECK (amount > 0),
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','refunded','voided')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_store_created_idx ON public.sale_payments(store_id, created_at DESC);
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sale_payments_tenant_access" ON public.sale_payments;
CREATE POLICY "sale_payments_tenant_access" ON public.sale_payments
FOR ALL TO authenticated
USING (store_id = public.current_store_id())
WITH CHECK (store_id = public.current_store_id());

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'retail';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS table_label text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS guest_count integer;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS kitchen_status text NOT NULL DEFAULT 'not_required';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS external_order_ref text;
CREATE INDEX IF NOT EXISTS sales_customer_idx ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS sales_kitchen_idx ON public.sales(store_id, kitchen_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.product_modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.product_modifier_groups(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifier_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "modifier_groups_tenant_access" ON public.product_modifier_groups;
CREATE POLICY "modifier_groups_tenant_access" ON public.product_modifier_groups FOR ALL TO authenticated
USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());
DROP POLICY IF EXISTS "modifier_options_tenant_access" ON public.product_modifier_options;
CREATE POLICY "modifier_options_tenant_access" ON public.product_modifier_options FOR ALL TO authenticated
USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

CREATE TABLE IF NOT EXISTS public.store_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'not_tested',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, integration_key)
);
ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_integrations_tenant_access" ON public.store_integrations;
CREATE POLICY "store_integrations_tenant_access" ON public.store_integrations FOR ALL TO authenticated
USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['products:read','customers:read','sales:read']::text[],
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_store_idx ON public.api_keys(store_id, active);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_tenant_access" ON public.api_keys;
CREATE POLICY "api_keys_tenant_access" ON public.api_keys FOR ALL TO authenticated
USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS customers_touch_updated_at ON public.customers;
CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS modifier_groups_touch_updated_at ON public.product_modifier_groups;
CREATE TRIGGER modifier_groups_touch_updated_at BEFORE UPDATE ON public.product_modifier_groups
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS modifier_options_touch_updated_at ON public.product_modifier_options;
CREATE TRIGGER modifier_options_touch_updated_at BEFORE UPDATE ON public.product_modifier_options
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS store_integrations_touch_updated_at ON public.store_integrations;
CREATE TRIGGER store_integrations_touch_updated_at BEFORE UPDATE ON public.store_integrations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
