-- =============================================================================
-- SEZA POS — Full migration concatenation
-- Generated: 2026-08-23T08:16:22Z
-- Concatenation of every .sql file in supabase/migrations/ in filename order.
-- SQL is reproduced verbatim, unmodified. Not intended for direct execution on an
-- existing database (statements assume sequential application on a fresh project).
-- =============================================================================


-- =============================================================================
-- FILE: supabase/migrations/20260630015401_e5827f45-3f1d-4a89-a325-495043e41248.sql
-- =============================================================================


CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE public.app_role AS ENUM ('owner','manager','cashier','admin');
CREATE TYPE public.payment_method AS ENUM ('cash','card','tap','apple_pay','google_pay','gift_card','split','store_credit');

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text, phone text,
  tax_rate numeric(5,4) NOT NULL DEFAULT 0.0825,
  currency text NOT NULL DEFAULT 'USD',
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, email text, avatar_url text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, store_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=ANY(_roles))
$$;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL, color text DEFAULT '#2563eb',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sku text, barcode text, name text NOT NULL,
  description text, brand text, supplier text,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  stock numeric(12,3) NOT NULL DEFAULT 0,
  min_stock numeric(12,3) NOT NULL DEFAULT 0,
  max_stock numeric(12,3),
  unit text NOT NULL DEFAULT 'each',
  track_inventory boolean NOT NULL DEFAULT true,
  is_favorite boolean NOT NULL DEFAULT false,
  image_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_store ON public.products(store_id);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  amount_tendered numeric(12,2),
  change_due numeric(12,2),
  status text NOT NULL DEFAULT 'completed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_store_created ON public.sales(store_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store_id uuid; v_user_count int;
BEGIN
  SELECT count(*) INTO v_user_count FROM public.profiles;
  IF v_user_count = 0 THEN
    INSERT INTO public.stores (name) VALUES ('My Store') RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;
  INSERT INTO public.profiles (id, full_name, email, store_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email, v_store_id);
  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "stores_select" ON public.stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "stores_modify" ON public.stores FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "user_roles_modify" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "categories_select" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_modify" ON public.categories FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_modify" ON public.products FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "sales_select" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (cashier_id = auth.uid());
CREATE POLICY "sales_update_mgmt" ON public.sales FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "sale_items_select" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.cashier_id = auth.uid()));


-- =============================================================================
-- FILE: supabase/migrations/20260630015422_279aa1c9-ca98-42ba-93fa-51f24a2baf39.sql
-- =============================================================================


REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;


-- =============================================================================
-- FILE: supabase/migrations/20260701070014_35b65eb6-8d87-40ec-b92d-435e93a40528.sql
-- =============================================================================


-- Phase 1: Receipts and Refunds

-- Add sequential receipt numbers to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS receipt_number bigint,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS terminal_ref text;

CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.tg_assign_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := nextval('public.receipt_number_seq');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_assign_receipt ON public.sales;
CREATE TRIGGER sales_assign_receipt BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.tg_assign_receipt_number();

CREATE UNIQUE INDEX IF NOT EXISTS sales_receipt_number_key ON public.sales(receipt_number);

-- Backfill existing sales
UPDATE public.sales SET receipt_number = nextval('public.receipt_number_seq') WHERE receipt_number IS NULL;

-- Refunds
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  cashier_id uuid,
  approver_id uuid,
  refund_type text NOT NULL DEFAULT 'partial', -- full | partial | exchange | store_credit | void
  reason text NOT NULL DEFAULT 'other',        -- damaged | wrong_item | changed_mind | duplicate | other
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds readable by store users" ON public.refunds
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "refunds insert by staff" ON public.refunds
  FOR INSERT TO authenticated WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','cashier']::app_role[])
  );

CREATE TABLE IF NOT EXISTS public.refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  restock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_items TO authenticated;
GRANT ALL ON public.refund_items TO service_role;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_items readable" ON public.refund_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "refund_items insert by staff" ON public.refund_items
  FOR INSERT TO authenticated WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','cashier']::app_role[])
  );

-- When a refund_item with restock=true is inserted, add stock back to product
CREATE OR REPLACE FUNCTION public.tg_restock_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.restock AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock + NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS refund_items_restock ON public.refund_items;
CREATE TRIGGER refund_items_restock AFTER INSERT ON public.refund_items
FOR EACH ROW EXECUTE FUNCTION public.tg_restock_on_refund();

-- After a refund is inserted, update sale.refunded_amount and refund_status
CREATE OR REPLACE FUNCTION public.tg_update_sale_refund_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_total numeric; v_sale_total numeric;
BEGIN
  SELECT COALESCE(SUM(total),0) INTO v_total FROM public.refunds WHERE sale_id = NEW.sale_id;
  SELECT total INTO v_sale_total FROM public.sales WHERE id = NEW.sale_id;
  UPDATE public.sales SET
    refunded_amount = v_total,
    refund_status = CASE
      WHEN v_total <= 0 THEN 'none'
      WHEN v_total >= v_sale_total THEN 'full'
      ELSE 'partial'
    END,
    status = CASE WHEN NEW.refund_type = 'void' THEN 'voided' ELSE status END
  WHERE id = NEW.sale_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS refunds_update_sale ON public.refunds;
CREATE TRIGGER refunds_update_sale AFTER INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_update_sale_refund_totals();

-- When a sale_item is inserted, decrement product stock (was missing)
CREATE OR REPLACE FUNCTION public.tg_decrement_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sale_items_decrement_stock ON public.sale_items;
CREATE TRIGGER sale_items_decrement_stock AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.tg_decrement_stock_on_sale();

-- Receipt settings on stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS receipt_header text,
  ADD COLUMN IF NOT EXISTS receipt_footer text DEFAULT 'Thank you for your business!',
  ADD COLUMN IF NOT EXISTS return_policy text DEFAULT 'Returns accepted within 14 days with receipt.',
  ADD COLUMN IF NOT EXISTS email text;


-- =============================================================================
-- FILE: supabase/migrations/20260701072509_e3d02960-a8e6-40cc-b996-568cc1a13d25.sql
-- =============================================================================


CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  attempted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text,
  method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL,
  message text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read payment attempts"
  ON public.payment_attempts FOR SELECT
  TO authenticated
  USING (
    store_id IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.store_id = payment_attempts.store_id)
  );

CREATE POLICY "staff can insert payment attempts"
  ON public.payment_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    attempted_by IS NULL OR attempted_by = auth.uid()
  );

CREATE INDEX payment_attempts_created_at_idx ON public.payment_attempts (created_at DESC);


-- =============================================================================
-- FILE: supabase/migrations/20260701073046_39619992-84b6-4737-acc8-8aab9da9978f.sql
-- =============================================================================


-- 1. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS employee_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS hire_date date;

-- 2. Employee-ID generator
CREATE OR REPLACE FUNCTION public.generate_employee_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id text;
BEGIN
  LOOP
    new_id := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id = new_id);
  END LOOP;
  RETURN new_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;

-- 3. Backfill
UPDATE public.profiles SET employee_id = public.generate_employee_id() WHERE employee_id IS NULL;

-- 4. Quick-login helper (id -> email, only if account is active)
CREATE OR REPLACE FUNCTION public.email_for_employee_id(p_employee_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
    FROM public.profiles
   WHERE employee_id = p_employee_id
     AND status = 'active'
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.email_for_employee_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_for_employee_id(text) TO anon, authenticated;

-- 5. Time entries
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  break_start timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self insert time entries" ON public.time_entries;
CREATE POLICY "self insert time entries" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self update time entries" ON public.time_entries;
CREATE POLICY "self update time entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE INDEX IF NOT EXISTS time_entries_user_idx ON public.time_entries (user_id, clock_in DESC);

-- 6. Handle_new_user: ensure new signups also get an employee_id.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_user_count int;
  v_emp_id text;
BEGIN
  SELECT count(*) INTO v_user_count FROM public.profiles;
  IF v_user_count = 0 THEN
    INSERT INTO public.stores (name) VALUES ('My Store') RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    v_store_id,
    v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END
$$;


-- =============================================================================
-- FILE: supabase/migrations/20260701074524_e8d7a6fb-768c-4ada-82ea-244540f0d9b2.sql
-- =============================================================================


ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';

-- Storage RLS policies for product-images bucket (bucket created via storage tool)
DO $$ BEGIN
  CREATE POLICY "product-images public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product-images authenticated write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product-images authenticated update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product-images authenticated delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- FILE: supabase/migrations/20260701080137_9bc9cf13-5535-4524-9639-f2b4931a3562.sql
-- =============================================================================

-- 1. Extend stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS time_zone text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'MM/DD/YYYY',
  ADD COLUMN IF NOT EXISTS business_hours jsonb DEFAULT '{}'::jsonb;

-- 2. Role permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read role permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners and admins manage role permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- Helper: does the current user have a given permission via any of their roles?
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission = _permission
  );
$$;

-- Seed defaults (idempotent via UNIQUE)
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner','*'),
  ('admin','*'),
  ('manager','sales.create'),('manager','sales.void'),('manager','sales.discount'),
  ('manager','sales.price_override'),('manager','refunds.create'),('manager','refunds.approve'),
  ('manager','products.edit'),('manager','products.delete'),('manager','inventory.edit'),
  ('manager','reports.view'),('manager','reports.export'),('manager','register.open'),
  ('manager','register.close'),('manager','employees.view'),('manager','settings.view'),
  ('cashier','sales.create'),('cashier','sales.discount'),('cashier','register.open'),('cashier','register.close')
ON CONFLICT (role, permission) DO NOTHING;

-- 3. Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees insert their own audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE POLICY "Employees read their own audit entries"
  ON public.audit_log FOR SELECT TO authenticated
  USING (actor_id = auth.uid());

CREATE POLICY "Managers and owners read all audit entries"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));

-- =============================================================================
-- FILE: supabase/migrations/20260701173836_01a7f8ad-b025-4a9f-9e3e-992dbdfa1f5e.sql
-- =============================================================================


-- Payroll & schedule fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_wage numeric(10,2),
  ADD COLUMN IF NOT EXISTS scheduled_start_time text,
  ADD COLUMN IF NOT EXISTS scheduled_end_time text,
  ADD COLUMN IF NOT EXISTS late_threshold_minutes integer NOT NULL DEFAULT 5;

-- Late-tracking & manager-override columns on time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS override_reason text;

-- Compute late on clock-in based on scheduled_start_time.
CREATE OR REPLACE FUNCTION public.tg_time_entries_compute_late()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched text;
  v_threshold int;
  v_tz text;
  v_now_local timestamp;
  v_sched_local timestamp;
  v_diff_min int;
BEGIN
  SELECT scheduled_start_time, late_threshold_minutes
    INTO v_sched, v_threshold
    FROM public.profiles WHERE id = NEW.user_id;

  IF v_sched IS NULL OR v_sched = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(time_zone, 'UTC') INTO v_tz
    FROM public.stores WHERE id = NEW.store_id;
  IF v_tz IS NULL THEN v_tz := 'UTC'; END IF;

  v_now_local := (NEW.clock_in AT TIME ZONE v_tz);
  v_sched_local := (date_trunc('day', v_now_local) + v_sched::time);
  v_diff_min := EXTRACT(EPOCH FROM (v_now_local - v_sched_local)) / 60;

  IF v_diff_min > COALESCE(v_threshold, 5) THEN
    NEW.late := true;
    NEW.late_minutes := v_diff_min;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_time_entries_compute_late ON public.time_entries;
CREATE TRIGGER trg_time_entries_compute_late
BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_time_entries_compute_late();

-- Manager override audit view helper (optional): use existing audit_log table.


-- =============================================================================
-- FILE: supabase/migrations/20260701174527_dc5edf7b-54cd-48c5-a0e1-a3eb876186cd.sql
-- =============================================================================


-- Register sessions
CREATE TABLE public.register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  terminal_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  expected_cash numeric,
  cash_sales numeric NOT NULL DEFAULT 0,
  cash_refunds numeric NOT NULL DEFAULT 0,
  variance numeric,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.register_sessions TO authenticated;
GRANT ALL ON public.register_sessions TO service_role;

ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view store register sessions"
  ON public.register_sessions FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can open register sessions"
  ON public.register_sessions FOR INSERT TO authenticated
  WITH CHECK (opened_by = auth.uid() AND store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Owner/opener can update register sessions"
  ON public.register_sessions FOR UPDATE TO authenticated
  USING (opened_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::app_role[]));

CREATE TRIGGER register_sessions_updated_at
  BEFORE UPDATE ON public.register_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payment terminals
CREATE TABLE public.payment_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'manual',
  serial text,
  location text,
  status text NOT NULL DEFAULT 'inactive',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_terminals TO authenticated;
GRANT ALL ON public.payment_terminals TO service_role;

ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view store terminals"
  ON public.payment_terminals FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers can manage terminals"
  ON public.payment_terminals FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::app_role[]));

CREATE TRIGGER payment_terminals_updated_at
  BEFORE UPDATE ON public.payment_terminals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Link sales to register sessions
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS register_session_id uuid REFERENCES public.register_sessions(id);
CREATE INDEX IF NOT EXISTS sales_register_session_id_idx ON public.sales(register_session_id);


-- =============================================================================
-- FILE: supabase/migrations/20260701181701_5b85353d-c5b6-42de-9d6c-cd44bdd0f0c6.sql
-- =============================================================================


-- Prevent duplicate open shifts per user
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_user
  ON public.time_entries (user_id)
  WHERE clock_out IS NULL;

-- Managers should also be able to see everyone's shifts
DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries"
  ON public.time_entries FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );


-- =============================================================================
-- FILE: supabase/migrations/20260701182701_31fe26c6-d370-4582-a4c4-047a6c40a6e9.sql
-- =============================================================================


ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;


-- =============================================================================
-- FILE: supabase/migrations/20260701182731_ac38b7c1-0ca4-4d45-9d57-95462c490223.sql
-- =============================================================================


DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_admin_write" ON storage.objects;
CREATE POLICY "avatars_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  );


-- =============================================================================
-- FILE: supabase/migrations/20260701222916_623ab887-9e06-4523-9522-a1d071888fa2.sql
-- =============================================================================


ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS currency_symbol text,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_logo_url text,
  ADD COLUMN IF NOT EXISTS thank_you_message text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;


-- =============================================================================
-- FILE: supabase/migrations/20260701232122_2a0323e7-f729-470e-b7df-d21a4f3a0000.sql
-- =============================================================================


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


-- =============================================================================
-- FILE: supabase/migrations/20260701235148_2b3ff7d0-f561-4cbd-84d4-e5ef712d8ec2.sql
-- =============================================================================


-- Phase G1: Country Profiles & Localization Foundation

CREATE TABLE IF NOT EXISTS public.country_profiles (
  country_code text PRIMARY KEY,
  country_name text NOT NULL,
  default_language text NOT NULL DEFAULT 'en',
  default_locale text NOT NULL DEFAULT 'en-US',
  currency_code text NOT NULL,
  currency_symbol text NOT NULL,
  symbol_position text NOT NULL DEFAULT 'before', -- 'before' | 'after'
  decimal_precision int NOT NULL DEFAULT 2,
  thousands_sep text NOT NULL DEFAULT ',',
  decimal_sep text NOT NULL DEFAULT '.',
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY',
  time_format text NOT NULL DEFAULT 'h:mm A',
  address_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_format text,
  postal_regex text,
  paper_size text NOT NULL DEFAULT 'letter', -- 'letter' | 'a4'
  default_tax_rate numeric NOT NULL DEFAULT 0,
  tax_inclusive_default boolean NOT NULL DEFAULT false,
  receipt_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_reg_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rtl boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.country_profiles TO anon, authenticated;
GRANT ALL ON public.country_profiles TO service_role;
ALTER TABLE public.country_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "country_profiles readable by all" ON public.country_profiles FOR SELECT USING (true);

-- Extend stores with country/locale metadata
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.country_profiles(country_code),
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS paper_size text,
  ADD COLUMN IF NOT EXISTS address_format_override jsonb,
  ADD COLUMN IF NOT EXISTS phone_format_override text;

-- Extend profiles with user language preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text,
  ADD COLUMN IF NOT EXISTS preferred_locale text;

-- Seed country profiles
INSERT INTO public.country_profiles
  (country_code, country_name, default_language, default_locale, currency_code, currency_symbol, symbol_position, decimal_precision, thousands_sep, decimal_sep, date_format, time_format, paper_size, default_tax_rate, tax_inclusive_default, rtl, age_defaults, regions)
VALUES
  ('US','United States','en','en-US','USD','$','before',2,',','.','MM/DD/YYYY','h:mm A','letter',0.0825,false,false,'{"alcohol":21,"tobacco":21,"vape":21,"lottery":18,"cannabis":21}','["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]'),
  ('CA','Canada','en','en-CA','CAD','$','before',2,',','.','YYYY-MM-DD','h:mm A','letter',0.13,false,false,'{"alcohol":19,"tobacco":19,"vape":19,"cannabis":19}','["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]'),
  ('GB','United Kingdom','en','en-GB','GBP','£','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18,"vape":18,"lottery":18}','[]'),
  ('HT','Haiti','ht','ht-HT','HTG','G','before',2,',','.','DD/MM/YYYY','HH:mm','letter',0.10,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('MX','Mexico','es','es-MX','MXN','$','before',2,',','.','DD/MM/YYYY','HH:mm','letter',0.16,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('BR','Brazil','pt-BR','pt-BR','BRL','R$','before',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.17,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('FR','France','fr','fr-FR','EUR','€','after',2,' ',',','DD/MM/YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('DE','Germany','de','de-DE','EUR','€','after',2,'.',',','DD.MM.YYYY','HH:mm','a4',0.19,true,false,'{"alcohol":16,"tobacco":18}','[]'),
  ('ES','Spain','es','es-ES','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.21,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('IT','Italy','it','it-IT','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.22,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('NL','Netherlands','nl','nl-NL','EUR','€','before',2,'.',',','DD-MM-YYYY','HH:mm','a4',0.21,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('PL','Poland','pl','pl-PL','PLN','zł','after',2,' ',',','DD.MM.YYYY','HH:mm','a4',0.23,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('PT','Portugal','pt','pt-PT','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.23,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('RO','Romania','ro','ro-RO','RON','lei','after',2,'.',',','DD.MM.YYYY','HH:mm','a4',0.19,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('TR','Turkey','tr','tr-TR','TRY','₺','before',2,'.',',','DD.MM.YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('GR','Greece','el','el-GR','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.24,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('RU','Russia','ru','ru-RU','RUB','₽','after',2,' ',',','DD.MM.YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('UA','Ukraine','uk','uk-UA','UAH','₴','after',2,' ',',','DD.MM.YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('SA','Saudi Arabia','ar','ar-SA','SAR','﷼','after',2,',','.','DD/MM/YYYY','HH:mm','a4',0.15,true,true,'{}','[]'),
  ('IL','Israel','he','he-IL','ILS','₪','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.17,true,true,'{"alcohol":18,"tobacco":18}','[]'),
  ('IN','India','hi','hi-IN','INR','₹','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.18,true,false,'{"alcohol":21,"tobacco":18}','[]'),
  ('CN','China','zh-CN','zh-CN','CNY','¥','before',2,',','.','YYYY-MM-DD','HH:mm','a4',0.13,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('TW','Taiwan','zh-TW','zh-TW','TWD','NT$','before',0,',','.','YYYY/MM/DD','HH:mm','a4',0.05,true,false,'{"alcohol":18,"tobacco":20}','[]'),
  ('JP','Japan','ja','ja-JP','JPY','¥','before',0,',','.','YYYY/MM/DD','HH:mm','a4',0.10,true,false,'{"alcohol":20,"tobacco":20}','[]'),
  ('KR','Korea','ko','ko-KR','KRW','₩','before',0,',','.','YYYY-MM-DD','HH:mm','a4',0.10,true,false,'{"alcohol":19,"tobacco":19}','[]'),
  ('TH','Thailand','th','th-TH','THB','฿','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.07,true,false,'{"alcohol":20,"tobacco":20}','[]'),
  ('VN','Vietnam','vi','vi-VN','VND','₫','after',0,'.',',','DD/MM/YYYY','HH:mm','a4',0.10,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('ID','Indonesia','id','id-ID','IDR','Rp','before',0,'.',',','DD/MM/YYYY','HH:mm','a4',0.11,true,false,'{"alcohol":21,"tobacco":18}','[]'),
  ('MY','Malaysia','ms','ms-MY','MYR','RM','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.06,true,false,'{"alcohol":21,"tobacco":18}','[]'),
  ('AU','Australia','en','en-AU','AUD','$','before',2,',','.','DD/MM/YYYY','h:mm A','a4',0.10,true,false,'{"alcohol":18,"tobacco":18}','["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"]')
ON CONFLICT (country_code) DO NOTHING;

-- Default existing stores to US when unset
UPDATE public.stores SET country_code = 'US' WHERE country_code IS NULL;


-- =============================================================================
-- FILE: supabase/migrations/20260702053704_email_infra.sql
-- =============================================================================

-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- =============================================================================
-- FILE: supabase/migrations/20260702060059_7ef3e82e-fed6-4e80-bc6d-9b8323581813.sql
-- =============================================================================

-- =========================================================
-- Subscriptions table
-- =========================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  paddle_subscription_id text NOT NULL UNIQUE,
  paddle_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_store_id ON public.subscriptions(store_id);
CREATE INDEX idx_subscriptions_paddle_id ON public.subscriptions(paddle_subscription_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- Stores: denormalized plan_tier + trial_ends_at
-- =========================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'trial_pro',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS plan_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS plan_cancel_at_period_end boolean DEFAULT false;

-- Backfill trial for existing stores that have none set
UPDATE public.stores
   SET trial_ends_at = COALESCE(trial_ends_at, created_at + interval '7 days')
 WHERE trial_ends_at IS NULL;

-- =========================================================
-- Helpers
-- =========================================================
-- Map product_id / price_id -> tier
CREATE OR REPLACE FUNCTION public.plan_tier_for_product(_product_id text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _product_id
    WHEN 'business_plan' THEN 'business'
    WHEN 'pro_plan' THEN 'pro'
    WHEN 'starter_plan' THEN 'starter'
    ELSE 'starter'
  END;
$$;

CREATE OR REPLACE FUNCTION public.tier_rank(_tier text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _tier
    WHEN 'business' THEN 3
    WHEN 'pro' THEN 2
    WHEN 'trial_pro' THEN 2
    WHEN 'starter' THEN 1
    ELSE 0
  END;
$$;

-- Recompute a store's plan_tier / plan_status from newest subscription + trial
CREATE OR REPLACE FUNCTION public.recompute_store_plan(_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_trial_ends timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT trial_ends_at INTO v_trial_ends FROM public.stores WHERE id = _store_id;

  SELECT s.* INTO v_sub
    FROM public.subscriptions s
   WHERE s.store_id = _store_id
     AND s.environment = CASE
       WHEN current_setting('app.environment', true) = 'live' THEN 'live'
       ELSE 'sandbox'
     END
   ORDER BY s.created_at DESC
   LIMIT 1;

  -- If no env-scoped row, just take newest of any env
  IF v_sub IS NULL THEN
    SELECT s.* INTO v_sub
      FROM public.subscriptions s
     WHERE s.store_id = _store_id
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  IF v_sub.id IS NOT NULL AND (
        v_sub.status IN ('active','trialing','past_due')
        OR (v_sub.status = 'canceled' AND v_sub.current_period_end > v_now)
     ) THEN
    UPDATE public.stores SET
      plan_tier = public.plan_tier_for_product(v_sub.product_id),
      plan_status = v_sub.status,
      plan_period_end = v_sub.current_period_end,
      plan_cancel_at_period_end = COALESCE(v_sub.cancel_at_period_end, false)
    WHERE id = _store_id;
  ELSIF v_trial_ends IS NOT NULL AND v_trial_ends > v_now THEN
    UPDATE public.stores SET
      plan_tier = 'trial_pro',
      plan_status = 'trialing',
      plan_period_end = v_trial_ends,
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  ELSE
    UPDATE public.stores SET
      plan_tier = 'expired',
      plan_status = 'expired',
      plan_period_end = COALESCE(v_sub.current_period_end, v_trial_ends),
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  END IF;
END $$;

-- Trigger: whenever a subscription row changes, recompute owning store
CREATE OR REPLACE FUNCTION public.tg_subscription_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.store_id IS NOT NULL THEN
    PERFORM public.recompute_store_plan(NEW.store_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_subscription_recompute
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_recompute();

-- Feature gate helpers (used by client via RPC or server code)
CREATE OR REPLACE FUNCTION public.has_active_plan(_store_id uuid, _min_tier text DEFAULT 'starter')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id
       AND plan_status IN ('active','trialing','past_due')
       AND public.tier_rank(plan_tier) >= public.tier_rank(_min_tier)
       AND (plan_period_end IS NULL OR plan_period_end > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_read_only(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id
       AND plan_status IN ('active','trialing','past_due')
       AND (plan_period_end IS NULL OR plan_period_end > now())
  );
$$;

-- Test-only helper the app calls from a dev button in Billing
CREATE OR REPLACE FUNCTION public.simulate_trial_expiry(_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.stores
     SET trial_ends_at = now() - interval '1 minute'
   WHERE id = _store_id;
  PERFORM public.recompute_store_plan(_store_id);
END $$;
GRANT EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_plan(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_read_only(uuid) TO authenticated;

-- =========================================================
-- Update handle_new_user to seed 7-day trial on new store
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id uuid;
  v_user_count int;
  v_emp_id text;
BEGIN
  SELECT count(*) INTO v_user_count FROM public.profiles;
  IF v_user_count = 0 THEN
    INSERT INTO public.stores (name, trial_ends_at, plan_tier, plan_status, plan_period_end)
      VALUES ('My Store', now() + interval '7 days', 'trial_pro', 'trialing', now() + interval '7 days')
      RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    v_store_id,
    v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END
$function$;

-- Initialize plan state for existing stores
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.stores LOOP
    PERFORM public.recompute_store_plan(r.id);
  END LOOP;
END $$;


-- =============================================================================
-- FILE: supabase/migrations/20260702074648_aaf976b3-6b3a-49c0-9abc-2a771c90229e.sql
-- =============================================================================


-- Helper: current user's store_id
CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT store_id FROM public.profiles WHERE id = auth.uid() $$;

REVOKE EXECUTE ON FUNCTION public.current_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated;

-- ============ RLS tightening ============

-- products
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- sales
DROP POLICY IF EXISTS sales_select ON public.sales;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- sale_items via join
DROP POLICY IF EXISTS sale_items_select ON public.sale_items;
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.store_id = public.current_store_id()));

-- refunds
DROP POLICY IF EXISTS "refunds readable by store users" ON public.refunds;
CREATE POLICY "refunds readable by store users" ON public.refunds FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- refund_items via join
DROP POLICY IF EXISTS "refund_items readable" ON public.refund_items;
CREATE POLICY "refund_items readable" ON public.refund_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.refunds r WHERE r.id = refund_items.refund_id AND r.store_id = public.current_store_id()));

-- categories
DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- stores
DROP POLICY IF EXISTS stores_select ON public.stores;
CREATE POLICY stores_select ON public.stores FOR SELECT TO authenticated
  USING (id = public.current_store_id());

-- age_verifications
DROP POLICY IF EXISTS "Staff can read age verifications" ON public.age_verifications;
CREATE POLICY "Staff can read age verifications" ON public.age_verifications FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- payment_attempts: remove NULL bypass
DROP POLICY IF EXISTS "staff can read payment attempts" ON public.payment_attempts;
CREATE POLICY "staff can read payment attempts" ON public.payment_attempts FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND store_id = public.current_store_id());

-- role_permissions: restrict to management
DROP POLICY IF EXISTS "Anyone signed in can read role permissions" ON public.role_permissions;
CREATE POLICY "Management can read role permissions" ON public.role_permissions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role]));

-- ============ Storage policies ============

-- Avatars: restrict reads to same-store staff or owner of file
DROP POLICY IF EXISTS avatars_read ON storage.objects;
CREATE POLICY avatars_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.store_id = (
            SELECT p2.store_id FROM public.profiles p2 WHERE p2.id = storage.objects.owner
          )
      )
    )
  );

-- product-images write: restrict to management of same store; path convention: <store_id>/<file>
DROP POLICY IF EXISTS "product-images authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "product-images public read" ON storage.objects;

CREATE POLICY "product-images read same store" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images' AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.store_id = (SELECT p2.store_id FROM public.profiles p2 WHERE p2.id = storage.objects.owner)
      )
    )
  );

CREATE POLICY "product-images insert same store" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );

CREATE POLICY "product-images update same store" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND owner = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );

CREATE POLICY "product-images delete same store" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND owner = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );

-- ============ Function search_path & EXECUTE grants ============

ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_assign_receipt_number() SET search_path = public;

-- Revoke EXECUTE on internal-only SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_store_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_for_employee_id(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_time_entries_compute_late() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_restock_on_refund() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_update_sale_refund_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;

-- Keep has_role/has_any_role/has_permission/has_active_plan/is_read_only/current_store_id executable by authenticated (used by RLS)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_plan(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_read_only(uuid) FROM PUBLIC, anon;


-- =============================================================================
-- FILE: supabase/migrations/20260702171811_8b2a6671-b99d-4c39-8927-6a8e5e899bcf.sql
-- =============================================================================


-- Add unique short store code
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_store_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  LOOP
    new_code := 'SZ-';
    FOR i IN 1..6 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stores WHERE store_code = new_code);
  END LOOP;
  RETURN new_code;
END $$;

REVOKE EXECUTE ON FUNCTION public.generate_store_code() FROM PUBLIC, anon, authenticated;

-- Backfill existing stores without codes
UPDATE public.stores SET store_code = public.generate_store_code() WHERE store_code IS NULL;

-- Rewrite handle_new_user: a merchant signup is any auth.users row whose
-- raw_user_meta_data contains `business_name`. It creates a brand-new store,
-- profile, and owner role. Any other signup (e.g. staff invited later, or the
-- very first bootstrap user) falls back to attaching to the first existing
-- store as cashier — preserving prior behavior.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_is_merchant boolean;
  v_business_name text;
  v_full_name text;
  v_phone text;
  v_country text;
  v_tz text;
  v_emp_id text;
  v_user_count int;
BEGIN
  v_business_name := NEW.raw_user_meta_data->>'business_name';
  v_is_merchant := v_business_name IS NOT NULL AND length(trim(v_business_name)) > 0;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'US');
  v_tz := COALESCE(NULLIF(NEW.raw_user_meta_data->>'time_zone', ''), 'America/New_York');

  SELECT count(*) INTO v_user_count FROM public.profiles;

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.stores (
      name, phone, country, time_zone, email, store_code,
      trial_ends_at, plan_tier, plan_status, plan_period_end
    ) VALUES (
      COALESCE(v_business_name, 'My Store'),
      v_phone,
      v_country,
      v_tz,
      NEW.email,
      public.generate_store_code(),
      now() + interval '14 days',
      'trial_pro',
      'trialing',
      now() + interval '14 days'
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id, v_full_name, NEW.email, v_store_id, v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END $$;


-- =============================================================================
-- FILE: supabase/migrations/20260702180201_1f239d69-3449-4201-8ce3-c7ad06c1efeb.sql
-- =============================================================================


-- 1) Fix mutable search_path on public functions
ALTER FUNCTION public.plan_tier_for_product(text) SET search_path = public;
ALTER FUNCTION public.tier_rank(text) SET search_path = public;

-- 2) Restrict email tables to service_role only
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "service_role manages send log" ON public.email_send_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "service_role manages send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "service_role manages unsubscribe tokens" ON public.email_unsubscribe_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "service_role manages suppressed emails" ON public.suppressed_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Revoke EXECUTE from signed-in users on internal SECURITY DEFINER functions.
--    RLS helper functions (has_role, has_any_role, has_permission, has_active_plan,
--    is_read_only, current_store_id, email_for_employee_id) remain callable so
--    row-level policies and existing server flows keep working.

REVOKE EXECUTE ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_store_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_store_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_restock_on_refund() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_time_entries_compute_late() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_update_sale_refund_totals() FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- FILE: supabase/migrations/20260703043705_acdbe73b-cc77-40e3-856e-c40ef4df5ff5.sql
-- =============================================================================


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


-- =============================================================================
-- FILE: supabase/migrations/20260703045335_fd48065a-e5cc-4378-8f8d-27cbfb678981.sql
-- =============================================================================


-- ============================================================
-- 1. sales: explicit deny for DELETE (fail-closed, documented)
-- ============================================================
DROP POLICY IF EXISTS sales_no_delete ON public.sales;
CREATE POLICY sales_no_delete ON public.sales
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 2. country_profiles: restrict reads to authenticated users
-- ============================================================
DROP POLICY IF EXISTS "country_profiles readable by all" ON public.country_profiles;
DROP POLICY IF EXISTS country_profiles_select_authenticated ON public.country_profiles;
CREATE POLICY country_profiles_select_authenticated
  ON public.country_profiles
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 3. storage.avatars: allow owners to manage their own avatar
--    Path convention: "<profile_id>/avatar-*.ext"
-- ============================================================
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ============================================================
-- 4. storage.product-images: tighten update/delete with
--    same-store scoping (uploader must share the current user's store)
-- ============================================================
DROP POLICY IF EXISTS "product-images update same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images delete same store" ON storage.objects;

CREATE POLICY "product-images update same store" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p_owner
        JOIN public.profiles p_me ON p_me.id = auth.uid()
        WHERE p_owner.id = storage.objects.owner
          AND p_owner.store_id IS NOT NULL
          AND p_owner.store_id = p_me.store_id
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

CREATE POLICY "product-images delete same store" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p_owner
        JOIN public.profiles p_me ON p_me.id = auth.uid()
        WHERE p_owner.id = storage.objects.owner
          AND p_owner.store_id IS NOT NULL
          AND p_owner.store_id = p_me.store_id
      )
    )
  );

-- ============================================================
-- 5. SECURITY DEFINER helpers not used in RLS policies: revoke
--    direct RPC access from anon/authenticated. Service role and
--    server functions (via context.supabase) that need these are
--    already handled through admin client or removed usage.
--    The three helpers still used in RLS policies (has_role,
--    has_any_role, current_store_id) MUST remain executable by
--    authenticated for RLS to evaluate; that is Supabase's own
--    recommended pattern.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_active_plan(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_plan(uuid, text) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_read_only(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_read_only(uuid) FROM anon, authenticated;

-- Harden the RLS-referenced helpers with in-function authorization:
-- only allow lookups against the caller's own uid, admins/owners, or
-- the service_role. RLS calls always pass auth.uid() and are unaffected.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('owner'::app_role, 'admin'::app_role)
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('owner'::app_role, 'admin'::app_role)
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)
    )
    ELSE false
  END
$$;


-- =============================================================================
-- FILE: supabase/migrations/20260703045507_7648f4b6-156b-4810-a630-b77cfa4456c9.sql
-- =============================================================================


-- sale_items: add store binding on insert
DROP POLICY IF EXISTS "sale_items_insert" ON public.sale_items;
CREATE POLICY "sale_items_insert" ON public.sale_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.id = sale_items.sale_id
       AND s.cashier_id = auth.uid()
       AND s.store_id = public.current_store_id()
  )
);

-- refunds: constrain to same store and to an existing sale in that store
DROP POLICY IF EXISTS "refunds insert by staff" ON public.refunds;
CREATE POLICY "refunds insert by staff" ON public.refunds
FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','cashier']::app_role[])
  AND store_id = public.current_store_id()
  AND EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.id = refunds.sale_id
       AND s.store_id = public.current_store_id()
  )
);

-- refund_items: constrain to a refund in current store
DROP POLICY IF EXISTS "refund_items insert by staff" ON public.refund_items;
CREATE POLICY "refund_items insert by staff" ON public.refund_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','cashier']::app_role[])
  AND EXISTS (
    SELECT 1 FROM public.refunds r
     WHERE r.id = refund_items.refund_id
       AND r.store_id = public.current_store_id()
  )
);

-- sms_send_log: add store-scoped insert/update policies for authenticated staff
CREATE POLICY "sms_send_log_insert_store" ON public.sms_send_log
FOR INSERT TO authenticated
WITH CHECK (store_id = public.current_store_id());

CREATE POLICY "sms_send_log_update_store" ON public.sms_send_log
FOR UPDATE TO authenticated
USING (store_id = public.current_store_id())
WITH CHECK (store_id = public.current_store_id());


-- =============================================================================
-- FILE: supabase/migrations/20260703185202_0827bbbd-707c-404b-a432-d564c5c03a73.sql
-- =============================================================================


-- 1) Scope has_any_role() to caller's current store
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('owner'::app_role, 'admin'::app_role)
          AND store_id = public.current_store_id()
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = ANY(_roles)
        AND store_id = public.current_store_id()
    )
    ELSE false
  END
$function$;

-- 2) age_verifications insert: enforce store scope
DROP POLICY IF EXISTS "Cashiers can insert their own age verifications" ON public.age_verifications;
CREATE POLICY "Cashiers can insert their own age verifications"
  ON public.age_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND store_id = public.current_store_id()
  );

-- 3) sales insert: enforce store scope
DROP POLICY IF EXISTS "sales_insert" ON public.sales;
CREATE POLICY "sales_insert"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND store_id = public.current_store_id()
  );

-- 4) payment_attempts insert: enforce store scope
DROP POLICY IF EXISTS "staff can insert payment attempts" ON public.payment_attempts;
CREATE POLICY "staff can insert payment attempts"
  ON public.payment_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (attempted_by IS NULL OR attempted_by = auth.uid())
    AND store_id = public.current_store_id()
  );

-- 5) time_entries insert: enforce store scope
DROP POLICY IF EXISTS "self insert time entries" ON public.time_entries;
CREATE POLICY "self insert time entries"
  ON public.time_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND store_id = public.current_store_id()
  );

-- 6) register_sessions update: add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "Owner/opener can update register sessions" ON public.register_sessions;
CREATE POLICY "Owner/opener can update register sessions"
  ON public.register_sessions
  FOR UPDATE
  TO authenticated
  USING (
    opened_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND (
      opened_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    )
  );

-- 7) Revoke EXECUTE on the test-only SECURITY DEFINER helper from signed-in users
REVOKE EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- FILE: supabase/migrations/20260704072857_9aa1294d-33c7-4b4d-aad5-1366cabefb55.sql
-- =============================================================================


-- 1) Restrict age_verifications SELECT to managers/admins/owners only
DROP POLICY IF EXISTS "Staff can read age verifications" ON public.age_verifications;
CREATE POLICY "Managers can read age verifications"
  ON public.age_verifications
  FOR SELECT
  TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  );

-- 2) Revoke direct EXECUTE on has_role from client roles.
-- has_role is not referenced by any RLS policy; app code now uses has_any_role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;


-- =============================================================================
-- FILE: supabase/migrations/20260704074708_43ca5c26-779e-47ec-9030-69c7238177fe.sql
-- =============================================================================

-- Tighten cross-tenant write policies to require the row's store_id matches the caller's store.

-- categories
DROP POLICY IF EXISTS "categories_modify" ON public.categories;
CREATE POLICY "categories_modify" ON public.categories
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- payment_terminals
DROP POLICY IF EXISTS "Managers can manage terminals" ON public.payment_terminals;
CREATE POLICY "Managers can manage terminals" ON public.payment_terminals
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  );

-- products
DROP POLICY IF EXISTS "products_modify" ON public.products;
CREATE POLICY "products_modify" ON public.products
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- sales (UPDATE only; add WITH CHECK)
DROP POLICY IF EXISTS "sales_update_mgmt" ON public.sales;
CREATE POLICY "sales_update_mgmt" ON public.sales
  FOR UPDATE
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- stores (row is the store itself — match by id)
DROP POLICY IF EXISTS "stores_modify" ON public.stores;
CREATE POLICY "stores_modify" ON public.stores
  FOR ALL
  USING (
    id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- user_roles
DROP POLICY IF EXISTS "user_roles_modify" ON public.user_roles;
CREATE POLICY "user_roles_modify" ON public.user_roles
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  );

-- audit_log: require store_id matches caller's store on insert
DROP POLICY IF EXISTS "Employees insert their own audit entries" ON public.audit_log;
CREATE POLICY "Employees insert their own audit entries" ON public.audit_log
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND store_id = public.current_store_id()
  );


-- =============================================================================
-- FILE: supabase/migrations/20260704173358_43e7b013-69a2-464e-8c5f-0b7b8029d429.sql
-- =============================================================================


DROP POLICY IF EXISTS "Managers and owners read all audit entries" ON public.audit_log;
CREATE POLICY "Managers and owners read all audit entries" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    AND store_id = public.current_store_id()
  );

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
      AND store_id = public.current_store_id()
    )
  );

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
      AND store_id = public.current_store_id()
    )
  );


-- =============================================================================
-- FILE: supabase/migrations/20260704180632_54b9d22e-d4b8-4fbc-8ac8-fea3f384e2ec.sql
-- =============================================================================

-- Scope cross-tenant policies to current store

DROP POLICY IF EXISTS "Owner/opener can update register sessions" ON public.register_sessions;
CREATE POLICY "Owner/opener can update register sessions"
ON public.register_sessions
FOR UPDATE
USING (
  store_id = public.current_store_id()
  AND (
    opened_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
)
WITH CHECK (
  store_id = public.current_store_id()
  AND (
    opened_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
);

DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries"
ON public.time_entries
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
);

-- =============================================================================
-- FILE: supabase/migrations/20260704183223_ee130652-887e-476c-b93c-aa8e8af42ff4.sql
-- =============================================================================


CREATE TABLE public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  register_session_id UUID NOT NULL REFERENCES public.register_sessions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('payout','deposit')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cash_movements_session_idx ON public.cash_movements(register_session_id);
CREATE INDEX cash_movements_store_idx ON public.cash_movements(store_id, created_at DESC);

GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members read cash movements"
  ON public.cash_movements FOR SELECT
  TO authenticated
  USING (store_id = public.current_store_id());

CREATE POLICY "Store members insert cash movements"
  ON public.cash_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id = public.current_store_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "Owners and admins delete cash movements"
  ON public.cash_movements FOR DELETE
  TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  );


-- =============================================================================
-- FILE: supabase/migrations/20260704204425_df105820-8b15-4038-ac9c-d89641ebf7db.sql
-- =============================================================================


-- 1) Restrict profile self-updates: prevent privileged column tampering via trigger
CREATE OR REPLACE FUNCTION public.tg_profiles_prevent_privileged_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role and privileged users (owner/admin) to change these columns.
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.pin_hash IS DISTINCT FROM OLD.pin_hash
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.hourly_wage IS DISTINCT FROM OLD.hourly_wage
       OR NEW.scheduled_start_time IS DISTINCT FROM OLD.scheduled_start_time
       OR NEW.scheduled_end_time IS DISTINCT FROM OLD.scheduled_end_time
       OR NEW.late_threshold_minutes IS DISTINCT FROM OLD.late_threshold_minutes
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.must_change_pin IS DISTINCT FROM OLD.must_change_pin
       OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
       OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_self_update ON public.profiles;
CREATE TRIGGER profiles_prevent_privileged_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_prevent_privileged_self_update();

-- 2) cash_movements: require privileged role on insert
DROP POLICY IF EXISTS "Store members insert cash movements" ON public.cash_movements;
CREATE POLICY "Privileged members insert cash movements"
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (
  store_id = public.current_store_id()
  AND user_id = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);

-- 3) sms_send_log: require privileged role on insert/update
DROP POLICY IF EXISTS sms_send_log_insert_store ON public.sms_send_log;
CREATE POLICY sms_send_log_insert_store
ON public.sms_send_log
FOR INSERT
TO authenticated
WITH CHECK (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);

DROP POLICY IF EXISTS sms_send_log_update_store ON public.sms_send_log;
CREATE POLICY sms_send_log_update_store
ON public.sms_send_log
FOR UPDATE
TO authenticated
USING (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
)
WITH CHECK (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);


-- =============================================================================
-- FILE: supabase/migrations/20260707064340_762ec58a-2d55-4ef5-b180-7f035fc90a48.sql
-- =============================================================================

-- 1) Lock down SECURITY DEFINER trigger function from anonymous execution
REVOKE EXECUTE ON FUNCTION public.tg_profiles_prevent_privileged_self_update() FROM PUBLIC, anon;

-- 2) Tighten profiles_update_own — prevent self-tampering of tenant/role columns
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
);

-- 3) Tighten self update time entries — prevent moving rows across tenants
DROP POLICY IF EXISTS "self update time entries" ON public.time_entries;
CREATE POLICY "self update time entries" ON public.time_entries
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND store_id = public.current_store_id())
WITH CHECK (user_id = auth.uid() AND store_id = public.current_store_id());

-- =============================================================================
-- FILE: supabase/migrations/20260710053010_68075932-ac59-43d7-8bee-0e8e8db61089.sql
-- =============================================================================

DROP POLICY IF EXISTS sms_send_log_select_store ON public.sms_send_log;
CREATE POLICY sms_send_log_select_store ON public.sms_send_log
FOR SELECT
USING (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);

-- =============================================================================
-- FILE: supabase/migrations/20260710054202_cf92cb9e-b4bc-4dfa-a58b-3b16f34e7a10.sql
-- =============================================================================

-- Replace Paddle columns with Stripe columns on subscriptions
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_paddle_subscription_id_key;
DROP INDEX IF EXISTS public.idx_subscriptions_paddle_id;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS paddle_subscription_id;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS paddle_customer_id;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_stripe_subscription_id_key') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

-- New tier mapping keyed off price_id (lookup_key, stable across sandbox/live).
CREATE OR REPLACE FUNCTION public.plan_tier_for_price(_price_id text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _price_id
    WHEN 'business_monthly' THEN 'business'
    WHEN 'pro_monthly'      THEN 'pro'
    WHEN 'starter_monthly'  THEN 'starter'
    ELSE 'starter'
  END;
$$;

-- Recompute store plan from most-recent subscription in current env,
-- keyed off price_id (webhook resolves lookup_key into this column).
CREATE OR REPLACE FUNCTION public.recompute_store_plan(_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_sub RECORD;
  v_trial_ends timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT trial_ends_at INTO v_trial_ends FROM public.stores WHERE id = _store_id;

  SELECT s.* INTO v_sub
    FROM public.subscriptions s
   WHERE s.store_id = _store_id
     AND s.environment = CASE
       WHEN current_setting('app.environment', true) = 'live' THEN 'live'
       ELSE 'sandbox'
     END
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_sub IS NULL THEN
    SELECT s.* INTO v_sub
      FROM public.subscriptions s
     WHERE s.store_id = _store_id
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  IF v_sub.id IS NOT NULL AND (
        v_sub.status IN ('active','trialing','past_due')
        OR (v_sub.status = 'canceled' AND v_sub.current_period_end > v_now)
     ) THEN
    UPDATE public.stores SET
      plan_tier = public.plan_tier_for_price(v_sub.price_id),
      plan_status = v_sub.status,
      plan_period_end = v_sub.current_period_end,
      plan_cancel_at_period_end = COALESCE(v_sub.cancel_at_period_end, false)
    WHERE id = _store_id;
  ELSIF v_trial_ends IS NOT NULL AND v_trial_ends > v_now THEN
    UPDATE public.stores SET
      plan_tier = 'trial_pro',
      plan_status = 'trialing',
      plan_period_end = v_trial_ends,
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  ELSE
    UPDATE public.stores SET
      plan_tier = 'expired',
      plan_status = 'expired',
      plan_period_end = COALESCE(v_sub.current_period_end, v_trial_ends),
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  END IF;
END $function$;

-- Old function is now unused; drop it to avoid confusion.
DROP FUNCTION IF EXISTS public.plan_tier_for_product(text);

-- Backend-only helper: resolve store for a user (used by webhook via service role).
-- No RLS change needed; webhook uses service role which bypasses RLS.

-- =============================================================================
-- FILE: supabase/migrations/20260710054220_6c8b56a8-54cf-46b8-bc49-3fed543c6f42.sql
-- =============================================================================

REVOKE ALL ON FUNCTION public.recompute_store_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_tier_for_price(text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- FILE: supabase/migrations/20260710054249_0cd47c52-f5e0-4d56-a80a-d060894ddf7c.sql
-- =============================================================================

REVOKE ALL ON FUNCTION public.tg_profiles_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- FILE: supabase/migrations/20260711055234_9bbe25a3-3d5d-4b1d-b9bb-f52feae02483.sql
-- =============================================================================


-- ============================================================
-- 1. role_permissions: partition per store (tenant scoping)
-- ============================================================
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Backfill: for each store, create a copy of every existing global row
INSERT INTO public.role_permissions (role, permission, store_id)
SELECT rp.role, rp.permission, s.id
FROM public.role_permissions rp
CROSS JOIN public.stores s
WHERE rp.store_id IS NULL
ON CONFLICT DO NOTHING;

-- Remove legacy global rows now that per-store copies exist
DELETE FROM public.role_permissions WHERE store_id IS NULL;

ALTER TABLE public.role_permissions ALTER COLUMN store_id SET NOT NULL;

-- Replace unique constraint to include store_id
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_permission_key;
DO $$ BEGIN
  ALTER TABLE public.role_permissions
    ADD CONSTRAINT role_permissions_store_role_permission_key UNIQUE (store_id, role, permission);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS role_permissions_store_idx ON public.role_permissions (store_id);

-- Recreate policies scoped to caller's store
DROP POLICY IF EXISTS "Anyone signed in can read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Owners and admins manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Management can read role permissions" ON public.role_permissions;

CREATE POLICY "Management can read role permissions"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

CREATE POLICY "Owners and admins manage role permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  );

-- Update has_permission to join on store as well as role
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$$;

-- ============================================================
-- 2. sms_send_log_select_store: restrict role grant to authenticated
-- ============================================================
DROP POLICY IF EXISTS sms_send_log_select_store ON public.sms_send_log;
CREATE POLICY sms_send_log_select_store ON public.sms_send_log
  FOR SELECT TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

-- ============================================================
-- 3. storage.avatars admin write: scope to same-store users only
-- ============================================================
DROP POLICY IF EXISTS avatars_admin_write ON storage.objects;
CREATE POLICY avatars_admin_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_owner
      JOIN public.profiles p_me ON p_me.id = auth.uid()
      WHERE p_owner.id = storage.objects.owner
        AND p_owner.store_id IS NOT NULL
        AND p_owner.store_id = p_me.store_id
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_owner
      JOIN public.profiles p_me ON p_me.id = auth.uid()
      WHERE p_owner.id = storage.objects.owner
        AND p_owner.store_id IS NOT NULL
        AND p_owner.store_id = p_me.store_id
    )
  );


-- =============================================================================
-- FILE: supabase/migrations/20260711084145_15e3d2a0-96fc-49e3-b88d-160bc154c383.sql
-- =============================================================================


-- Cash drawer control + shift close: extend register_sessions and cash_movements

-- register_sessions: closing snapshot fields
ALTER TABLE public.register_sessions
  ADD COLUMN IF NOT EXISTS safe_drop_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS close_notes text,
  ADD COLUMN IF NOT EXISTS denominations jsonb;

-- stores: shift-close prefs
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS starting_cash_float numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS show_expected_before_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variance_alert_threshold numeric NOT NULL DEFAULT 5;

-- cash_movements: allow safe_drop type
ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_type_check;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_type_check
  CHECK (type = ANY (ARRAY['payout'::text, 'deposit'::text, 'safe_drop'::text]));

-- Cashiers can insert safe drops linked to their own open session
CREATE POLICY "Cashiers insert safe drops for own open session"
ON public.cash_movements FOR INSERT TO authenticated
WITH CHECK (
  store_id = public.current_store_id()
  AND user_id = auth.uid()
  AND type = 'safe_drop'
  AND EXISTS (
    SELECT 1 FROM public.register_sessions rs
    WHERE rs.id = register_session_id
      AND rs.opened_by = auth.uid()
      AND rs.status = 'open'
  )
);


-- =============================================================================
-- FILE: supabase/migrations/20260711085633_f947edae-16de-4506-a77c-b811a7634173.sql
-- =============================================================================

DROP POLICY IF EXISTS "product-images insert same store" ON storage.objects;
CREATE POLICY "product-images insert same store"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  AND owner = auth.uid()
);

-- =============================================================================
-- FILE: supabase/migrations/20260712051300_39d36a6f-2a9c-4c29-9e5c-a34a372e51c2.sql
-- =============================================================================


-- Idempotency for offline-created sales & cash movements.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_idempotency_key_uidx
  ON public.sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS synced_from_offline boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS offline_created_at timestamptz;

ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_idempotency_key_uidx
  ON public.cash_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;


-- =============================================================================
-- FILE: supabase/migrations/20260715105336_de609661-762b-4007-902c-cda014373471.sql
-- =============================================================================

DROP POLICY IF EXISTS "Staff can view store terminals" ON public.payment_terminals;
CREATE POLICY "Managers can view store terminals" ON public.payment_terminals
  FOR SELECT TO authenticated
  USING (store_id = current_store_id() AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]));

-- =============================================================================
-- FILE: supabase/migrations/20260716195408_d70cf9ba-dd45-4cd3-98a3-31fba5613077.sql
-- =============================================================================

-- 1) Add new enum value (IF NOT EXISTS is idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) Helper function: is the user a platform super admin?
-- Uses text comparison so it works even in the same tx that adds the enum value.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- 3) Protect super_admin role assignments from being created/modified/deleted
-- by anyone other than an existing super_admin (or the service_role).
CREATE OR REPLACE FUNCTION public.tg_protect_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_touches_super boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_super := (NEW.role::text = 'super_admin');
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_super := (NEW.role::text = 'super_admin' OR OLD.role::text = 'super_admin');
  ELSIF TG_OP = 'DELETE' THEN
    v_touches_super := (OLD.role::text = 'super_admin');
  END IF;

  IF v_touches_super THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform super admins can manage the super_admin role';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_super_admin_role();

-- 4) Let super admins read all role assignments (for the admin console).
DROP POLICY IF EXISTS "super_admin_select_all_user_roles" ON public.user_roles;
CREATE POLICY "super_admin_select_all_user_roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- =============================================================================
-- FILE: supabase/migrations/20260716205118_68987b49-5eea-4467-b49d-0116af750f18.sql
-- =============================================================================

DO $$
DECLARE
  v_uid uuid := '75865a02-5e9f-4adc-9e0c-9de175205d18';
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Auth user % does not exist', v_uid;
  END IF;

  ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_super_admin;
  INSERT INTO public.user_roles (user_id, role, store_id)
    VALUES (v_uid, 'super_admin', NULL)
    ON CONFLICT DO NOTHING;
  ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_super_admin;

  SELECT count(*) INTO v_count
    FROM public.user_roles
   WHERE user_id = v_uid AND role = 'super_admin';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 super_admin row for %, found %', v_uid, v_count;
  END IF;
END $$;

-- =============================================================================
-- FILE: supabase/migrations/20260716205313_c500736a-c4be-4375-bb5e-621a2b7a923a.sql
-- =============================================================================

-- Fix 1: Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_protect_super_admin_role() FROM PUBLIC, anon;

-- Fix 2: Recreate policies scoped to `authenticated` role only

-- audit_log
DROP POLICY IF EXISTS "Employees insert their own audit entries" ON public.audit_log;
CREATE POLICY "Employees insert their own audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK ((actor_id = auth.uid()) AND (store_id = public.current_store_id()));

-- categories
DROP POLICY IF EXISTS categories_modify ON public.categories;
CREATE POLICY categories_modify
  ON public.categories FOR ALL TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- products
DROP POLICY IF EXISTS products_modify ON public.products;
CREATE POLICY products_modify
  ON public.products FOR ALL TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- register_sessions
DROP POLICY IF EXISTS "Owner/opener can update register sessions" ON public.register_sessions;
CREATE POLICY "Owner/opener can update register sessions"
  ON public.register_sessions FOR UPDATE TO authenticated
  USING ((store_id = public.current_store_id()) AND ((opened_by = auth.uid()) OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK ((store_id = public.current_store_id()) AND ((opened_by = auth.uid()) OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

-- sales
DROP POLICY IF EXISTS sales_update_mgmt ON public.sales;
CREATE POLICY sales_update_mgmt
  ON public.sales FOR UPDATE TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- stores
DROP POLICY IF EXISTS stores_modify ON public.stores;
CREATE POLICY stores_modify
  ON public.stores FOR ALL TO authenticated
  USING ((id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- user_roles
DROP POLICY IF EXISTS user_roles_modify ON public.user_roles;
CREATE POLICY user_roles_modify
  ON public.user_roles FOR ALL TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

-- =============================================================================
-- FILE: supabase/migrations/20260716211018_a835c913-a816-44e7-9d6a-3eba96fa67e6.sql
-- =============================================================================


-- Admin operations: support tickets, admin support sessions, admin-scoped columns and read policies for super_admin.

-- 1. Extend stores with admin-only fields
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 2. Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigserial UNIQUE NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_email text,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_store_idx ON public.support_tickets(store_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON public.support_tickets(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.support_tickets_ticket_number_seq TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT ALL ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_super_admin_all" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "support_tickets_merchant_view" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND store_id = public.current_store_id());

DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Support ticket notes
CREATE TABLE IF NOT EXISTS public.support_ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email text,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket_idx ON public.support_ticket_notes(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_notes TO authenticated;
GRANT ALL ON public.support_ticket_notes TO service_role;

ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_notes_super_admin_all" ON public.support_ticket_notes
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. Admin support sessions (support view audit)
CREATE TABLE IF NOT EXISTS public.admin_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS admin_support_sessions_admin_idx ON public.admin_support_sessions(admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_support_sessions_store_idx ON public.admin_support_sessions(store_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.admin_support_sessions TO authenticated;
GRANT ALL ON public.admin_support_sessions TO service_role;

ALTER TABLE public.admin_support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_support_sessions_super_admin_all" ON public.admin_support_sessions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. Super admin cross-store read policies for merchant tables
-- (additive: existing per-store policies remain in force for merchant users)

CREATE POLICY "stores_super_admin_select" ON public.stores
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "stores_super_admin_update" ON public.stores
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "profiles_super_admin_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "profiles_super_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "subscriptions_super_admin_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "payment_terminals_super_admin_all" ON public.payment_terminals
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "register_sessions_super_admin_select" ON public.register_sessions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "sales_super_admin_select" ON public.sales
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "refunds_super_admin_select" ON public.refunds
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "payment_attempts_super_admin_select" ON public.payment_attempts
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "audit_log_super_admin_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "cash_movements_super_admin_select" ON public.cash_movements
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "time_entries_super_admin_select" ON public.time_entries
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles_super_admin_modify" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 6. Helper: search entities globally for super_admin
CREATE OR REPLACE FUNCTION public.admin_global_search(_q text, _limit int DEFAULT 25)
RETURNS TABLE(kind text, id uuid, store_id uuid, label text, sublabel text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := lower(coalesce(_q, ''));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'store'::text, s.id, s.id,
           s.name,
           coalesce(s.email, s.store_code, s.city, '')::text
    FROM public.stores s
    WHERE lower(s.name) LIKE '%'||q||'%'
       OR lower(coalesce(s.store_code,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.phone,'')) LIKE '%'||q||'%'
       OR s.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'owner'::text, p.id, p.store_id,
           coalesce(p.full_name, p.email, '(no name)')::text,
           coalesce(p.email, p.phone, '')::text
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('owner'::app_role, 'admin'::app_role)
    WHERE lower(coalesce(p.full_name,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.phone,'')) LIKE '%'||q||'%'
       OR p.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'terminal'::text, t.id, t.store_id,
           t.label,
           coalesce(t.serial, t.provider, '')::text
    FROM public.payment_terminals t
    WHERE lower(t.label) LIKE '%'||q||'%'
       OR lower(coalesce(t.serial,'')) LIKE '%'||q||'%'
       OR t.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'subscription'::text, sub.id, sub.store_id,
           coalesce(sub.stripe_subscription_id, sub.id::text),
           coalesce(sub.status, '')::text
    FROM public.subscriptions sub
    WHERE lower(coalesce(sub.stripe_subscription_id,'')) LIKE '%'||q||'%'
       OR lower(coalesce(sub.stripe_customer_id,'')) LIKE '%'||q||'%'
       OR sub.id::text = q
    LIMIT _limit;
END $$;

REVOKE ALL ON FUNCTION public.admin_global_search(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_global_search(text, int) TO authenticated;


-- =============================================================================
-- FILE: supabase/migrations/20260718032554_ab329c1c-6b9c-45bd-91d8-24a9c59fb7f8.sql
-- =============================================================================


-- Scope payment_terminals policy to authenticated
DROP POLICY IF EXISTS "Managers can manage terminals" ON public.payment_terminals;
CREATE POLICY "Managers can manage terminals" ON public.payment_terminals
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))
  WITH CHECK ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]));

-- Scope time_entries select policy to authenticated
DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries" ON public.time_entries
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

-- Prevent store admins/owners from assigning super_admin via user_roles_modify
DROP POLICY IF EXISTS user_roles_modify ON public.user_roles;
CREATE POLICY user_roles_modify ON public.user_roles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (store_id = current_store_id())
    AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    AND role <> 'super_admin'::app_role
  )
  WITH CHECK (
    (store_id = current_store_id())
    AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    AND role <> 'super_admin'::app_role
  );


-- =============================================================================
-- FILE: supabase/migrations/20260718035336_68e1c147-ec66-438f-9cc1-a88bc795161f.sql
-- =============================================================================


-- 1. Extend app_role enum with additional platform-staff roles.
-- Use IF NOT EXISTS so re-runs are safe.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'billing_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analyst';

-- 2. Helper: is the user platform staff (any of the 5 platform roles)?
-- Compare via ::text so we don't need the new enum values to be committed.
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(uuid) TO authenticated, service_role;

-- 3. Update handle_new_user to skip merchant provisioning for platform staff.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_is_merchant boolean;
  v_business_name text;
  v_full_name text;
  v_phone text;
  v_country text;
  v_tz text;
  v_emp_id text;
  v_user_count int;
  v_is_platform boolean;
BEGIN
  -- Platform staff never get a merchant profile or merchant role auto-created.
  v_is_platform :=
    COALESCE(NEW.raw_user_meta_data->>'platform_staff', '') = 'true'
    OR public.is_platform_staff(NEW.id);

  IF v_is_platform THEN
    RETURN NEW;
  END IF;

  v_business_name := NEW.raw_user_meta_data->>'business_name';
  v_is_merchant := v_business_name IS NOT NULL AND length(trim(v_business_name)) > 0;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'US');
  v_tz := COALESCE(NULLIF(NEW.raw_user_meta_data->>'time_zone', ''), 'America/New_York');

  SELECT count(*) INTO v_user_count FROM public.profiles;

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.stores (
      name, phone, country, time_zone, email, store_code,
      trial_ends_at, plan_tier, plan_status, plan_period_end
    ) VALUES (
      COALESCE(v_business_name, 'My Store'),
      v_phone, v_country, v_tz, NEW.email,
      public.generate_store_code(),
      now() + interval '14 days',
      'trial_pro', 'trialing', now() + interval '14 days'
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  -- If no store exists (e.g. platform-only project state), do not force a merchant record.
  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id, v_full_name, NEW.email, v_store_id, v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END $$;

-- 4. Role-exclusivity trigger: forbid mixing platform and merchant roles on one user.
CREATE OR REPLACE FUNCTION public.tg_enforce_role_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_new_platform boolean;
  v_has_merchant boolean;
  v_has_platform boolean;
BEGIN
  v_is_new_platform := NEW.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst');

  IF v_is_new_platform THEN
    -- Inserting a platform role: user must not already have any merchant role.
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role::text NOT IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
    ) INTO v_has_merchant;
    IF v_has_merchant THEN
      RAISE EXCEPTION 'User % already has a merchant role; platform-staff roles cannot be mixed with merchant roles.', NEW.user_id;
    END IF;
  ELSE
    -- Inserting a merchant role: user must not already have any platform role.
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
    ) INTO v_has_platform;
    IF v_has_platform THEN
      RAISE EXCEPTION 'User % is platform staff; merchant roles cannot be assigned to platform accounts.', NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_role_exclusivity ON public.user_roles;
CREATE TRIGGER trg_enforce_role_exclusivity
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_role_exclusivity();

-- 5. One-time cleanup: any user who already has a platform role must not carry merchant rows.
-- Delete their merchant user_roles first, then their profiles.
DELETE FROM public.user_roles ur
WHERE ur.role::text NOT IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id
      AND ur2.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
  );

DELETE FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id
    AND ur.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
);


-- =============================================================================
-- FILE: supabase/migrations/20260718041600_c30da118-4c43-42fa-a1e0-94495c53828c.sql
-- =============================================================================


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


-- =============================================================================
-- FILE: supabase/migrations/20260718055021_f083fc02-6b6b-449d-89e1-ffa857bdb6a8.sql
-- =============================================================================


ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_note text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now();

UPDATE public.admin_support_sessions
   SET status = CASE WHEN ended_at IS NOT NULL THEN 'ended' ELSE 'active' END,
       decided_at = COALESCE(decided_at, started_at)
 WHERE status = 'pending' AND started_at IS NOT NULL;

ALTER TABLE public.admin_support_sessions
  DROP CONSTRAINT IF EXISTS admin_support_sessions_status_check;
ALTER TABLE public.admin_support_sessions
  ADD CONSTRAINT admin_support_sessions_status_check
  CHECK (status IN ('pending', 'active', 'declined', 'ended', 'expired'));

CREATE INDEX IF NOT EXISTS admin_support_sessions_store_status_idx
  ON public.admin_support_sessions (store_id, status)
  WHERE status IN ('pending', 'active');

DROP POLICY IF EXISTS "admin_support_sessions_merchant_read" ON public.admin_support_sessions;
CREATE POLICY "admin_support_sessions_merchant_read"
  ON public.admin_support_sessions
  FOR SELECT
  TO authenticated
  USING (store_id = public.current_store_id());

DROP POLICY IF EXISTS "admin_support_sessions_merchant_respond" ON public.admin_support_sessions;
CREATE POLICY "admin_support_sessions_merchant_respond"
  ON public.admin_support_sessions
  FOR UPDATE
  TO authenticated
  USING (store_id = public.current_store_id() AND status IN ('pending', 'active'))
  WITH CHECK (store_id = public.current_store_id() AND status IN ('active', 'declined', 'ended'));

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_support_sessions';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.admin_support_sessions REPLICA IDENTITY FULL;


-- =============================================================================
-- FILE: supabase/migrations/20260718061906_ff5c30b2-85da-411d-9358-c047fe7ce081.sql
-- =============================================================================


CREATE OR REPLACE FUNCTION public.tg_stores_prevent_platform_field_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
     OR NEW.plan_period_end IS DISTINCT FROM OLD.plan_period_end
     OR NEW.plan_cancel_at_period_end IS DISTINCT FROM OLD.plan_cancel_at_period_end
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.store_code IS DISTINCT FROM OLD.store_code THEN
    RAISE EXCEPTION 'Not allowed to modify platform-controlled store fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_prevent_platform_field_writes ON public.stores;
CREATE TRIGGER stores_prevent_platform_field_writes
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_stores_prevent_platform_field_writes();


-- =============================================================================
-- FILE: supabase/migrations/20260719063942_661e17ab-4152-41e7-affa-e353d51d3f81.sql
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.tg_stores_prevent_platform_field_writes() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- FILE: supabase/migrations/20260719084110_9c179411-8c3c-4dd2-9172-5ed04bd225e4.sql
-- =============================================================================

CREATE POLICY support_tickets_merchant_insert ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id() AND requester_id = auth.uid());
CREATE POLICY support_tickets_merchant_update ON public.support_tickets FOR UPDATE TO authenticated USING (store_id = public.current_store_id() AND requester_id = auth.uid()) WITH CHECK (store_id = public.current_store_id() AND requester_id = auth.uid());
CREATE POLICY ticket_notes_merchant_view ON public.support_ticket_notes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.store_id = public.current_store_id()));
CREATE POLICY ticket_notes_merchant_insert ON public.support_ticket_notes FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.store_id = public.current_store_id() AND t.requester_id = auth.uid()));
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename='support_ticket_number_seq') THEN CREATE SEQUENCE public.support_ticket_number_seq START 1000; GRANT USAGE ON SEQUENCE public.support_ticket_number_seq TO authenticated; END IF; END $$;
CREATE OR REPLACE FUNCTION public.tg_assign_ticket_number() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$ BEGIN IF NEW.ticket_number IS NULL THEN NEW.ticket_number := nextval('public.support_ticket_number_seq'); END IF; RETURN NEW; END $fn$;
DROP TRIGGER IF EXISTS tg_support_tickets_assign_number ON public.support_tickets;
CREATE TRIGGER tg_support_tickets_assign_number BEFORE INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.tg_assign_ticket_number();

-- =============================================================================
-- FILE: supabase/migrations/20260720233703_78f5d231-38f6-4dd0-9413-5bcfd779cc37.sql
-- =============================================================================

DROP POLICY IF EXISTS ticket_notes_merchant_insert ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_insert
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.store_id = public.current_store_id()
    )
  );

DROP POLICY IF EXISTS support_tickets_merchant_update ON public.support_tickets;
CREATE POLICY support_tickets_merchant_update
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (store_id = public.current_store_id())
  WITH CHECK (store_id = public.current_store_id());

-- =============================================================================
-- FILE: supabase/migrations/20260720234411_411603f8-e010-4e44-bad9-00d4d3d5e3eb.sql
-- =============================================================================

-- Tighten support ticket RLS: notes insert requires active same-store employee;
-- ticket updates go through a SECURITY DEFINER RPC that enforces role/requester
-- checks and restricts writable columns.

DROP POLICY IF EXISTS ticket_notes_merchant_insert ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_insert
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND internal = false
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.store_id = public.current_store_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.store_id = public.current_store_id()
        AND t.status NOT IN ('closed')
    )
  );

-- Merchants no longer update support_tickets directly.
DROP POLICY IF EXISTS support_tickets_merchant_update ON public.support_tickets;

CREATE OR REPLACE FUNCTION public.merchant_update_support_ticket(
  _ticket_id uuid,
  _status text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _subject text DEFAULT NULL
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_active boolean;
  v_ticket public.support_tickets;
  v_is_priv boolean;
  v_is_requester boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT store_id, (status = 'active') INTO v_store, v_active
    FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_active, false) OR v_store IS NULL THEN
    RAISE EXCEPTION 'Inactive or unassigned employee' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND OR v_ticket.store_id IS DISTINCT FROM v_store THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = '42501';
  END IF;

  v_is_requester := (v_ticket.requester_id = v_uid);
  v_is_priv :=
    public.has_any_role(v_uid, ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    OR public.has_permission(v_uid, 'support.manage');

  IF NOT (v_is_requester OR v_is_priv) THEN
    RAISE EXCEPTION 'Not permitted to modify this ticket' USING ERRCODE = '42501';
  END IF;

  -- Cashiers (non-privileged requesters) may not reassign priority.
  IF _priority IS NOT NULL AND NOT v_is_priv THEN
    RAISE EXCEPTION 'Not permitted to change priority' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('open','waiting_support','waiting_for_merchant','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;

  IF _priority IS NOT NULL AND _priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority' USING ERRCODE = '22023';
  END IF;

  UPDATE public.support_tickets
     SET status     = COALESCE(_status, status),
         priority   = COALESCE(_priority, priority),
         subject    = COALESCE(NULLIF(btrim(_subject), ''), subject),
         updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_ticket;

  RETURN v_ticket;
END
$$;

REVOKE ALL ON FUNCTION public.merchant_update_support_ticket(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_update_support_ticket(uuid, text, text, text) TO authenticated;

-- =============================================================================
-- FILE: supabase/migrations/20260721012054_474b89b9-8214-4cb8-bccf-6c09290dc579.sql
-- =============================================================================

alter table public.stores add column if not exists allow_cashier_quick_add boolean not null default false;
comment on column public.stores.allow_cashier_quick_add is 'When true, cashiers with the products.quick_add permission can create a product from the POS Register when a scanned barcode is not found.';

-- =============================================================================
-- FILE: supabase/migrations/20260721021539_734529d8-37d1-4f44-8c8f-5957cebb6a6d.sql
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.merchant_update_support_ticket(uuid, text, text, text) FROM anon, PUBLIC;

-- =============================================================================
-- FILE: supabase/migrations/20260721030113_2766fc9c-ea49-43b3-97cc-7371684364b1.sql
-- =============================================================================


-- Track what the merchant client can actually do when accepting a support session.
-- 'web_screen_share' = browser with getDisplayMedia (WebRTC screen streaming)
-- 'android_diagnostics_only' = bundled Android APK (no screen streaming; diagnostics context only)
ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS client_capability text
    CHECK (client_capability IN ('web_screen_share', 'android_diagnostics_only'));

ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS client_metadata jsonb;

COMMENT ON COLUMN public.admin_support_sessions.client_capability IS
  'Set by the merchant client when it accepts. Tells the admin viewer whether to expect a WebRTC screen stream or diagnostics-only context.';
COMMENT ON COLUMN public.admin_support_sessions.client_metadata IS
  'Safe, non-secret client context captured at accept time (platform, app version, os, device model, route). Redacted of PINs, tokens, card data.';


-- =============================================================================
-- FILE: supabase/migrations/20260721032518_3d63f38f-3513-41c8-8173-ecebd9f1c7a9.sql
-- =============================================================================


-- =========================================================================
-- Phase 1: Admin Foundation
-- =========================================================================

-- 1. admin_permissions catalog (text role column, decoupled from app_role enum
-- so we can add new platform-staff labels without ALTER TYPE dance).
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read admin permissions"
  ON public.admin_permissions FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: only service_role writes.

-- 2. has_admin_permission RPC
CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- super_admin always wins
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.admin_permissions ap
        ON ap.role = ur.role::text
      WHERE ur.user_id = _user_id
        AND (ap.permission = _permission OR ap.permission = '*')
    );
$$;

REVOKE ALL ON FUNCTION public.has_admin_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(uuid, text) TO authenticated, service_role;

-- 3. admin_login_attempts (rate limiting for /admin/auth)
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  success boolean NOT NULL,
  ip text,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time
  ON public.admin_login_attempts (lower(email), attempted_at DESC);

GRANT SELECT, INSERT ON public.admin_login_attempts TO authenticated;
GRANT ALL ON public.admin_login_attempts TO service_role;

ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only super_admin may read the raw log. Rate-limit checks run via service_role.
CREATE POLICY "Super admins can read login attempts"
  ON public.admin_login_attempts FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies: writes go through service_role.

-- 4. Broaden is_platform_staff to the full 7-role set.
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'super_admin',
        'operations_admin',
        'support_admin',
        'billing_admin',
        'analyst',
        'technical_support',
        'merchant_support',
        'compliance_support'
      )
  );
$$;

-- 5. Seed initial permission catalog.
-- super_admin bypass is in has_admin_permission, so no rows needed for it.
INSERT INTO public.admin_permissions (role, permission) VALUES
  -- operations_admin: broad read + most manage, no dangerous billing/refund by default
  ('operations_admin', 'businesses.view'),
  ('operations_admin', 'businesses.manage'),
  ('operations_admin', 'stores.view'),
  ('operations_admin', 'stores.manage'),
  ('operations_admin', 'employees.view'),
  ('operations_admin', 'employees.manage'),
  ('operations_admin', 'devices.view'),
  ('operations_admin', 'devices.manage'),
  ('operations_admin', 'support.view'),
  ('operations_admin', 'support.manage'),
  ('operations_admin', 'support.assign'),
  ('operations_admin', 'support.internal_notes'),
  ('operations_admin', 'support.request_view'),
  ('operations_admin', 'support.end_view'),
  ('operations_admin', 'diagnostics.view'),
  ('operations_admin', 'sync.manage'),
  ('operations_admin', 'hardware.manage'),
  ('operations_admin', 'incidents.view'),
  ('operations_admin', 'incidents.manage'),
  ('operations_admin', 'audit.view'),
  ('operations_admin', 'admin_users.view'),
  ('operations_admin', 'platform_settings.view'),
  ('operations_admin', 'trials.manage'),
  ('operations_admin', 'billing.view'),
  -- support_admin (legacy) / merchant_support: standard support toolkit
  ('support_admin', 'businesses.view'),
  ('support_admin', 'stores.view'),
  ('support_admin', 'employees.view'),
  ('support_admin', 'devices.view'),
  ('support_admin', 'support.view'),
  ('support_admin', 'support.manage'),
  ('support_admin', 'support.assign'),
  ('support_admin', 'support.internal_notes'),
  ('support_admin', 'support.request_view'),
  ('support_admin', 'support.end_view'),
  ('support_admin', 'diagnostics.view'),
  ('support_admin', 'incidents.view'),
  ('support_admin', 'audit.view'),
  ('merchant_support', 'businesses.view'),
  ('merchant_support', 'stores.view'),
  ('merchant_support', 'employees.view'),
  ('merchant_support', 'devices.view'),
  ('merchant_support', 'support.view'),
  ('merchant_support', 'support.manage'),
  ('merchant_support', 'support.assign'),
  ('merchant_support', 'support.internal_notes'),
  ('merchant_support', 'support.request_view'),
  ('merchant_support', 'support.end_view'),
  ('merchant_support', 'diagnostics.view'),
  ('merchant_support', 'incidents.view'),
  ('merchant_support', 'audit.view'),
  -- technical_support: heavier diagnostics/sync/device toolkit
  ('technical_support', 'businesses.view'),
  ('technical_support', 'stores.view'),
  ('technical_support', 'employees.view'),
  ('technical_support', 'devices.view'),
  ('technical_support', 'devices.manage'),
  ('technical_support', 'support.view'),
  ('technical_support', 'support.manage'),
  ('technical_support', 'support.assign'),
  ('technical_support', 'support.internal_notes'),
  ('technical_support', 'support.request_view'),
  ('technical_support', 'support.end_view'),
  ('technical_support', 'diagnostics.view'),
  ('technical_support', 'sync.manage'),
  ('technical_support', 'hardware.manage'),
  ('technical_support', 'incidents.view'),
  ('technical_support', 'incidents.manage'),
  ('technical_support', 'audit.view'),
  -- billing_admin / billing_support: subscriptions/payments only
  ('billing_admin', 'businesses.view'),
  ('billing_admin', 'billing.view'),
  ('billing_admin', 'billing.manage'),
  ('billing_admin', 'subscriptions.manage'),
  ('billing_admin', 'trials.manage'),
  ('billing_admin', 'support.view'),
  ('billing_admin', 'support.manage'),
  ('billing_admin', 'support.assign'),
  ('billing_admin', 'support.internal_notes'),
  ('billing_admin', 'audit.view'),
  ('billing_support', 'businesses.view'),
  ('billing_support', 'billing.view'),
  ('billing_support', 'billing.manage'),
  ('billing_support', 'subscriptions.manage'),
  ('billing_support', 'trials.manage'),
  ('billing_support', 'support.view'),
  ('billing_support', 'support.manage'),
  ('billing_support', 'support.assign'),
  ('billing_support', 'support.internal_notes'),
  ('billing_support', 'audit.view'),
  -- compliance_support: audit-focused, safe reads only
  ('compliance_support', 'businesses.view'),
  ('compliance_support', 'stores.view'),
  ('compliance_support', 'employees.view'),
  ('compliance_support', 'devices.view'),
  ('compliance_support', 'support.view'),
  ('compliance_support', 'support.internal_notes'),
  ('compliance_support', 'diagnostics.view'),
  ('compliance_support', 'incidents.view'),
  ('compliance_support', 'audit.view'),
  ('compliance_support', 'audit.export'),
  -- analyst / read_only_auditor: pure reads
  ('analyst', 'businesses.view'),
  ('analyst', 'stores.view'),
  ('analyst', 'employees.view'),
  ('analyst', 'devices.view'),
  ('analyst', 'support.view'),
  ('analyst', 'diagnostics.view'),
  ('analyst', 'incidents.view'),
  ('analyst', 'audit.view'),
  ('analyst', 'billing.view'),
  ('read_only_auditor', 'businesses.view'),
  ('read_only_auditor', 'stores.view'),
  ('read_only_auditor', 'employees.view'),
  ('read_only_auditor', 'devices.view'),
  ('read_only_auditor', 'support.view'),
  ('read_only_auditor', 'diagnostics.view'),
  ('read_only_auditor', 'incidents.view'),
  ('read_only_auditor', 'audit.view'),
  ('read_only_auditor', 'audit.export')
ON CONFLICT (role, permission) DO NOTHING;


-- =============================================================================
-- FILE: supabase/migrations/20260721040917_3ac90268-8bd8-437f-81ae-17192d3f77d8.sql
-- =============================================================================

-- ================================================================
-- Employee management security hardening
-- ================================================================

-- 1) Strict allowlist for self-service profile updates.
--    Only these columns may be changed by the row's owner unless the caller
--    is a privileged user (owner/admin) or service_role.
CREATE OR REPLACE FUNCTION public.tg_profiles_prevent_privileged_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  self_allowed_change boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> auth.uid() THEN
    -- Non-self edits by non-privileged users are already blocked by the
    -- profiles UPDATE policy; nothing else to do here.
    RETURN NEW;
  END IF;

  -- Self edit: any change outside the safe allowlist is denied.
  self_allowed_change :=
    (NEW.first_name IS NOT DISTINCT FROM OLD.first_name)
    AND (NEW.last_name IS NOT DISTINCT FROM OLD.last_name)
    AND (NEW.full_name IS NOT DISTINCT FROM OLD.full_name)
    AND (NEW.phone IS NOT DISTINCT FROM OLD.phone)
    AND (NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url)
    AND (NEW.preferred_language IS NOT DISTINCT FROM OLD.preferred_language)
    AND (NEW.preferred_locale IS NOT DISTINCT FROM OLD.preferred_locale)
    -- Every other column MUST remain unchanged.
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.pin_hash IS NOT DISTINCT FROM OLD.pin_hash)
    AND (NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id)
    AND (NEW.hourly_wage IS NOT DISTINCT FROM OLD.hourly_wage)
    AND (NEW.scheduled_start_time IS NOT DISTINCT FROM OLD.scheduled_start_time)
    AND (NEW.scheduled_end_time IS NOT DISTINCT FROM OLD.scheduled_end_time)
    AND (NEW.late_threshold_minutes IS NOT DISTINCT FROM OLD.late_threshold_minutes)
    AND (NEW.status IS NOT DISTINCT FROM OLD.status)
    AND (NEW.must_change_password IS NOT DISTINCT FROM OLD.must_change_password)
    AND (NEW.must_change_pin IS NOT DISTINCT FROM OLD.must_change_pin)
    AND (NEW.hire_date IS NOT DISTINCT FROM OLD.hire_date)
    AND (NEW.email IS NOT DISTINCT FROM OLD.email);

  IF NOT self_allowed_change THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_profiles_prevent_privileged_self_update()
  FROM PUBLIC, anon, authenticated;

-- 2) Helper: is this user the last remaining owner in their store?
CREATE OR REPLACE FUNCTION public.is_last_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'owner'::app_role
      AND (
        SELECT count(*)
        FROM public.user_roles ur2
        WHERE ur2.role = 'owner'::app_role
          AND ur2.store_id = ur.store_id
      ) <= 1
  );
$$;

REVOKE ALL ON FUNCTION public.is_last_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_last_owner(uuid) TO authenticated, service_role;

-- 3) Helper: encode merchant employee-management hierarchy
--   owner   -> may manage anyone in their store except the last remaining owner
--   admin   -> may manage admin/manager/cashier (not owner)
--   manager -> may manage cashiers only, in the same store, and not themselves
CREATE OR REPLACE FUNCTION public.can_manage_employee(_actor uuid, _target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_store uuid;
  v_target_store uuid;
  v_actor_roles text[];
  v_target_roles text[];
BEGIN
  IF _actor IS NULL OR _target IS NULL THEN RETURN false; END IF;

  SELECT store_id INTO v_actor_store  FROM public.profiles WHERE id = _actor;
  SELECT store_id INTO v_target_store FROM public.profiles WHERE id = _target;
  IF v_actor_store IS NULL OR v_target_store IS NULL
     OR v_actor_store <> v_target_store THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_actor_roles FROM public.user_roles
    WHERE user_id = _actor AND store_id = v_actor_store;
  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_target_roles FROM public.user_roles
    WHERE user_id = _target AND store_id = v_target_store;

  -- Never allow anyone to manage a platform-staff account through this path.
  IF v_target_roles && ARRAY[
    'super_admin','operations_admin','support_admin','billing_admin','analyst',
    'technical_support','merchant_support','compliance_support','billing_support',
    'read_only_auditor'
  ] THEN
    RETURN false;
  END IF;

  IF 'owner' = ANY(v_actor_roles) THEN
    -- Owner may manage anyone but must not act on themselves for
    -- role/removal (checked at call site via is_last_owner).
    RETURN true;
  END IF;

  IF 'admin' = ANY(v_actor_roles) THEN
    -- Admin may manage admin/manager/cashier, not owner.
    RETURN NOT ('owner' = ANY(v_target_roles));
  END IF;

  IF 'manager' = ANY(v_actor_roles) THEN
    -- Manager may only touch cashiers (never themselves, another manager,
    -- an admin, or an owner).
    IF _actor = _target THEN RETURN false; END IF;
    RETURN NOT (
      'owner'   = ANY(v_target_roles)
      OR 'admin'   = ANY(v_target_roles)
      OR 'manager' = ANY(v_target_roles)
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(uuid, uuid) TO authenticated, service_role;

-- 4) Trigger guarding user_roles: never leave a store with zero owners.
CREATE OR REPLACE FUNCTION public.tg_user_roles_protect_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_user  uuid;
  v_remaining int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role::text <> 'owner' THEN RETURN OLD; END IF;
    v_store := OLD.store_id; v_user := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only care when demoting away from owner.
    IF OLD.role::text = 'owner' AND NEW.role::text <> 'owner' THEN
      v_store := OLD.store_id; v_user := OLD.user_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
    FROM public.user_roles
    WHERE store_id = v_store
      AND role = 'owner'::app_role
      AND user_id <> v_user;

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'Cannot demote or remove the last owner of this business';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.tg_user_roles_protect_last_owner()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_protect_last_owner ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_owner
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_protect_last_owner();

-- =============================================================================
-- FILE: supabase/migrations/20260721043359_02c4ae9c-0231-4e22-8d43-2327e4546e7b.sql
-- =============================================================================


-- 1) Restrict admin_permissions catalog reads to platform staff.
DROP POLICY IF EXISTS "admin_permissions_read_all_authenticated" ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_permissions_read_authenticated" ON public.admin_permissions;
DROP POLICY IF EXISTS "Admin permissions readable" ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_permissions_select" ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_permissions read authenticated" ON public.admin_permissions;

CREATE POLICY "admin_permissions_platform_staff_read"
  ON public.admin_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_staff(auth.uid()));

-- 2) Unguessable per-session channel token for the WebRTC signaling topic.
--    RLS on admin_support_sessions already restricts reads to the assigned
--    admin and the target store's employees, so only those participants can
--    ever learn the token and join the private topic.
ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS channel_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS admin_support_sessions_channel_token_idx
  ON public.admin_support_sessions(channel_token);


-- =============================================================================
-- FILE: supabase/migrations/20260721050014_6154b426-56d7-46a8-88cb-72e03677b44e.sql
-- =============================================================================

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


-- =============================================================================
-- FILE: supabase/migrations/20260721050938_cdb145f9-52e0-4cd6-a664-a53a8573f43c.sql
-- =============================================================================


-- 1) admin_permissions: drop overly-permissive read policy
DROP POLICY IF EXISTS "Authenticated can read admin permissions" ON public.admin_permissions;

-- 2) time_entries: restrict self-updates via trigger to safe columns only
CREATE OR REPLACE FUNCTION public.tg_time_entries_prevent_privileged_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  self_allowed boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  self_allowed :=
    (NEW.clock_out IS NOT DISTINCT FROM OLD.clock_out OR OLD.clock_out IS NULL)
    AND (NEW.break_start IS NOT DISTINCT FROM OLD.break_start OR OLD.break_start IS NULL)
    AND (NEW.break_end IS NOT DISTINCT FROM OLD.break_end OR OLD.break_end IS NULL)
    AND (NEW.notes IS NOT DISTINCT FROM OLD.notes OR OLD.notes IS NULL OR NEW.notes IS NOT NULL)
    AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.clock_in IS NOT DISTINCT FROM OLD.clock_in)
    AND (NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by)
    AND (NEW.late IS NOT DISTINCT FROM OLD.late)
    AND (NEW.late_minutes IS NOT DISTINCT FROM OLD.late_minutes);

  IF NOT self_allowed THEN
    RAISE EXCEPTION 'Not allowed to modify privileged time entry fields';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_time_entries_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_prevent_privileged_self_update ON public.time_entries;
CREATE TRIGGER time_entries_prevent_privileged_self_update
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_time_entries_prevent_privileged_self_update();


-- =============================================================================
-- FILE: supabase/migrations/20260721220000_pos_live_configuration.sql
-- =============================================================================

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


-- =============================================================================
-- FILE: supabase/migrations/20260722052348_ed6c3e80-be1d-4351-a8c9-f1fb0403aaad.sql
-- =============================================================================

REVOKE SELECT ON public.device_registrations FROM authenticated;
GRANT SELECT (
  id, store_id, label, platform, app_version, status, status_snapshot,
  paired_at, paired_by, last_seen_at, last_sync_at,
  revoked_at, revoked_by, revoke_reason, created_at, updated_at
) ON public.device_registrations TO authenticated;

DROP POLICY IF EXISTS "support_tickets_merchant_view" ON public.support_tickets;
CREATE POLICY "support_tickets_merchant_view" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    store_id IS NOT NULL
    AND store_id = public.current_store_id()
    AND (
      requester_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    )
  );

-- =============================================================================
-- FILE: supabase/migrations/20260722090000_admin_company_operations.sql
-- =============================================================================

-- ============================================================================
-- SEZA Platform Operations correction
-- Company staff, merchant billing, support lifecycle, and live communications
-- Additive and idempotent.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. SEZA company staff metadata
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  department text NOT NULL DEFAULT 'Operations',
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('invited','active','inactive')),
  phone text,
  started_on date,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_staff_profiles TO service_role;
ALTER TABLE public.admin_staff_profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS admin_staff_profiles_updated_at ON public.admin_staff_profiles;
CREATE TRIGGER admin_staff_profiles_updated_at
  BEFORE UPDATE ON public.admin_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed the real founder record only when the existing account is present.
INSERT INTO public.admin_staff_profiles (user_id, title, department, employment_status, started_on)
SELECT p.id, 'Founder & CEO', 'Executive', 'active', CURRENT_DATE
FROM public.profiles p
WHERE lower(p.email) = 'admin@sezapos.com'
ON CONFLICT (user_id) DO UPDATE
SET title = 'Founder & CEO',
    department = 'Executive',
    employment_status = 'active';

-- --------------------------------------------------------------------------
-- 2. Platform settings (one global row)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'global',
  company_name text NOT NULL DEFAULT 'SEZA POS',
  support_email text NOT NULL DEFAULT 'support@sezapos.com',
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com',
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com',
  timezone text NOT NULL DEFAULT 'America/New_York',
  default_trial_days integer NOT NULL DEFAULT 14 CHECK (default_trial_days BETWEEN 1 AND 90),
  support_sla_minutes integer NOT NULL DEFAULT 60 CHECK (support_sla_minutes BETWEEN 5 AND 10080),
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- --------------------------------------------------------------------------
-- 3. Professional support lifecycle and persistent live chat
-- --------------------------------------------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS device_registration_id uuid REFERENCES public.device_registrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_tickets_chat_status_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_chat_status_check
      CHECK (chat_status IN ('waiting','active','ended'));
  END IF;
END $$;

-- Normalize the older label used by the first support implementation.
UPDATE public.support_tickets
SET status = 'investigating'
WHERE status = 'waiting_support';

UPDATE public.support_tickets
SET resolution_summary = COALESCE(resolution_summary, resolution),
    last_message_at = COALESCE(
      last_message_at,
      (SELECT max(n.created_at) FROM public.support_ticket_notes n WHERE n.ticket_id = support_tickets.id),
      updated_at
    ),
    chat_status = CASE
      WHEN chat_ended_at IS NOT NULL THEN 'ended'
      WHEN status IN ('resolved','closed') AND chat_status = 'waiting' THEN 'ended'
      ELSE chat_status
    END;

CREATE INDEX IF NOT EXISTS support_tickets_active_work_idx
  ON public.support_tickets(status, assigned_admin_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_chat_idx
  ON public.support_tickets(chat_status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_device_idx
  ON public.support_tickets(device_registration_id);

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON public.support_ticket_events(ticket_id, created_at);

-- Keep a permanent creation event for both old and new cases.
INSERT INTO public.support_ticket_events (
  ticket_id, actor_id, actor_email, event_type, from_status, to_status, details, created_at
)
SELECT
  t.id, t.requester_id, t.requester_email, 'created', NULL, t.status,
  jsonb_build_object('subject', t.subject, 'priority', t.priority), t.created_at
FROM public.support_tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_ticket_events e
  WHERE e.ticket_id = t.id AND e.event_type = 'created'
);

CREATE OR REPLACE FUNCTION public.tg_support_ticket_created_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.support_ticket_events (
    ticket_id, actor_id, actor_email, event_type, from_status, to_status, details, created_at
  ) VALUES (
    NEW.id, NEW.requester_id, NEW.requester_email, 'created', NULL, NEW.status,
    jsonb_build_object('subject', NEW.subject, 'priority', NEW.priority), NEW.created_at
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_ticket_created_event ON public.support_tickets;
CREATE TRIGGER support_ticket_created_event
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_created_event();

GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- Platform staff may subscribe to tickets and messages with their isolated
-- admin session. Writes still go through audited server functions.
DROP POLICY IF EXISTS support_tickets_platform_staff_select ON public.support_tickets;
CREATE POLICY support_tickets_platform_staff_select
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS support_ticket_notes_platform_staff_select ON public.support_ticket_notes;
CREATE POLICY support_ticket_notes_platform_staff_select
  ON public.support_ticket_notes FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

-- Never expose internal notes to merchants.
DROP POLICY IF EXISTS ticket_notes_merchant_view ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_view
  ON public.support_ticket_notes FOR SELECT TO authenticated
  USING (
    internal = false
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.store_id = public.current_store_id()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_support_note_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NEW.created_at,
      updated_at = now(),
      chat_status = CASE WHEN NEW.internal THEN chat_status ELSE 'active' END,
      chat_ended_at = CASE WHEN NEW.internal THEN chat_ended_at ELSE NULL END,
      chat_ended_by = CASE WHEN NEW.internal THEN chat_ended_by ELSE NULL END,
      status = CASE WHEN NOT NEW.internal AND status = 'resolved' THEN 'open' ELSE status END,
      resolved_at = CASE WHEN NOT NEW.internal AND status = 'resolved' THEN NULL ELSE resolved_at END,
      closed_at = CASE WHEN NOT NEW.internal AND status = 'resolved' THEN NULL ELSE closed_at END,
      first_response_at = CASE
        WHEN first_response_at IS NULL
         AND NEW.author_id IS NOT NULL
         AND public.is_platform_staff(NEW.author_id)
        THEN NEW.created_at
        ELSE first_response_at
      END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_note_activity ON public.support_ticket_notes;
CREATE TRIGGER support_note_activity
  AFTER INSERT ON public.support_ticket_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_note_activity();


-- Merchant read receipts for the live support thread.
CREATE OR REPLACE FUNCTION public.merchant_mark_support_read(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store
  FROM public.profiles
  WHERE id = auth.uid() AND status = 'active';

  IF v_store IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = _ticket_id AND store_id = v_store
  ) THEN
    RAISE EXCEPTION 'Support case not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_tickets
  SET last_merchant_read_at = now()
  WHERE id = _ticket_id;
END
$$;

REVOKE ALL ON FUNCTION public.merchant_mark_support_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_mark_support_read(uuid) TO authenticated;

-- Realtime for support chat. Avoid duplicate publication membership.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_ticket_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 4. Merchant-to-SEZA subscription payment ledger
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE,
  stripe_invoice_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  status text NOT NULL,
  amount_due_cents bigint NOT NULL DEFAULT 0,
  amount_paid_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  billing_reason text,
  hosted_invoice_url text,
  invoice_pdf_url text,
  failure_message text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_billing_payments_store_idx
  ON public.merchant_billing_payments(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS merchant_billing_payments_status_idx
  ON public.merchant_billing_payments(status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS merchant_billing_payments_subscription_idx
  ON public.merchant_billing_payments(stripe_subscription_id);

GRANT ALL ON public.merchant_billing_payments TO service_role;
ALTER TABLE public.merchant_billing_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS merchant_billing_payments_updated_at ON public.merchant_billing_payments;
CREATE TRIGGER merchant_billing_payments_updated_at
  BEFORE UPDATE ON public.merchant_billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- =============================================================================
-- FILE: supabase/migrations/20260722113000_admin_company_operations_hardening.sql
-- =============================================================================

-- SEZA Admin company operations hardening
-- Safe to apply after 20260722090000_admin_company_operations.sql.

-- --------------------------------------------------------------------------
-- 1. Trusted sender identity for persistent support chat
-- --------------------------------------------------------------------------
ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'merchant';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_ticket_notes_sender_kind_check'
  ) THEN
    ALTER TABLE public.support_ticket_notes
      ADD CONSTRAINT support_ticket_notes_sender_kind_check
      CHECK (sender_kind IN ('merchant', 'admin', 'system'));
  END IF;
END $$;

UPDATE public.support_ticket_notes
SET sender_kind = CASE
  WHEN author_id IS NOT NULL AND public.is_platform_staff(author_id) THEN 'admin'
  ELSE 'merchant'
END;

CREATE OR REPLACE FUNCTION public.tg_support_note_sender_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.sender_kind := CASE
    WHEN NEW.author_id IS NOT NULL AND public.is_platform_staff(NEW.author_id) THEN 'admin'
    ELSE 'merchant'
  END;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_note_sender_kind ON public.support_ticket_notes;
CREATE TRIGGER support_note_sender_kind
  BEFORE INSERT OR UPDATE OF author_id ON public.support_ticket_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_note_sender_kind();

-- --------------------------------------------------------------------------
-- 2. Merchant support privacy
-- Cashiers may only read and chat on cases they personally opened.
-- Owners/admins/managers may support their whole store. Platform staff retain
-- access through the separate platform-staff policies.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS support_tickets_merchant_view ON public.support_tickets;
CREATE POLICY support_tickets_merchant_view
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    store_id IS NOT NULL
    AND store_id = public.current_store_id()
    AND (
      requester_id = auth.uid()
      OR public.has_any_role(
        auth.uid(),
        ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
      )
    )
  );

-- Ticket status, assignment, and resolution are controlled only by audited
-- SEZA server functions. Merchant clients never need direct ticket UPDATE.
DROP POLICY IF EXISTS support_tickets_merchant_update ON public.support_tickets;

DROP POLICY IF EXISTS ticket_notes_merchant_view ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_view
  ON public.support_ticket_notes
  FOR SELECT
  TO authenticated
  USING (
    internal = false
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets ticket
      WHERE ticket.id = ticket_id
        AND ticket.store_id = public.current_store_id()
        AND (
          ticket.requester_id = auth.uid()
          OR public.has_any_role(
            auth.uid(),
            ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
          )
        )
    )
  );

DROP POLICY IF EXISTS ticket_notes_merchant_insert ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_insert
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND internal = false
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets ticket
      WHERE ticket.id = ticket_id
        AND ticket.store_id = public.current_store_id()
        AND (
          ticket.requester_id = auth.uid()
          OR public.has_any_role(
            auth.uid(),
            ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
          )
        )
    )
  );

-- --------------------------------------------------------------------------
-- 3. Never expose the paired-device secret hash to authenticated clients.
-- API verification still works because server endpoints use service_role.
-- --------------------------------------------------------------------------
REVOKE SELECT ON TABLE public.device_registrations FROM authenticated;
GRANT SELECT (
  id,
  store_id,
  label,
  status,
  platform,
  paired_by,
  paired_at,
  last_seen_at,
  revoked_at,
  revoked_by,
  revoke_reason,
  created_at,
  updated_at,
  status_snapshot,
  app_version,
  last_sync_at
) ON TABLE public.device_registrations TO authenticated;

-- Ensure the founder metadata remains authoritative even if the profile name
-- or company-staff row was edited elsewhere.
INSERT INTO public.admin_staff_profiles (
  user_id,
  title,
  department,
  employment_status
)
SELECT
  profile.id,
  'Founder & CEO',
  'Executive',
  'active'
FROM public.profiles profile
WHERE lower(profile.email) = 'admin@sezapos.com'
ON CONFLICT (user_id) DO UPDATE
SET title = 'Founder & CEO',
    department = 'Executive',
    employment_status = 'active';

-- --------------------------------------------------------------------------
-- 4. Make the founder-controlled default trial length operational for every
-- new merchant account, while always excluding invited SEZA company staff
-- from merchant provisioning.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_is_merchant boolean;
  v_business_name text;
  v_full_name text;
  v_phone text;
  v_country text;
  v_tz text;
  v_emp_id text;
  v_user_count int;
  v_is_platform boolean;
  v_trial_days integer := 14;
BEGIN
  v_is_platform :=
    COALESCE(NEW.raw_user_meta_data->>'platform_staff', '') = 'true'
    OR COALESCE(NEW.raw_user_meta_data->>'seza_company_staff', '') = 'true'
    OR public.is_platform_staff(NEW.id);

  IF v_is_platform THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(default_trial_days, 14)
  INTO v_trial_days
  FROM public.platform_settings
  WHERE id = 'global';
  v_trial_days := COALESCE(v_trial_days, 14);

  v_business_name := NEW.raw_user_meta_data->>'business_name';
  v_is_merchant := v_business_name IS NOT NULL AND length(trim(v_business_name)) > 0;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'US');
  v_tz := COALESCE(NULLIF(NEW.raw_user_meta_data->>'time_zone', ''), 'America/New_York');

  SELECT count(*) INTO v_user_count FROM public.profiles;

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.stores (
      name,
      phone,
      country,
      time_zone,
      email,
      store_code,
      trial_ends_at,
      plan_tier,
      plan_status,
      plan_period_end
    ) VALUES (
      COALESCE(v_business_name, 'My Store'),
      v_phone,
      v_country,
      v_tz,
      NEW.email,
      public.generate_store_code(),
      now() + make_interval(days => v_trial_days),
      'trial_pro',
      'trialing',
      now() + make_interval(days => v_trial_days)
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    store_id,
    employee_id,
    first_name,
    last_name
  ) VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_store_id,
    v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id)
    VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id)
    VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END
$$;

-- --------------------------------------------------------------------------
-- 5. Make the global headquarters search useful to all authorized SEZA staff.
-- Results remain read-only; page mutations keep their stricter server gates.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_global_search(_q text, _limit int DEFAULT 25)
RETURNS TABLE(kind text, id uuid, store_id uuid, label text, sublabel text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(coalesce(_q, '')));
  max_rows integer := greatest(1, least(coalesce(_limit, 25), 50));
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'business'::text, store.id, store.id,
           store.name,
           coalesce(store.email, store.store_code, store.city, '')::text
    FROM public.stores store
    WHERE lower(store.name) LIKE '%' || q || '%'
       OR lower(coalesce(store.store_code, '')) LIKE '%' || q || '%'
       OR lower(coalesce(store.email, '')) LIKE '%' || q || '%'
       OR lower(coalesce(store.phone, '')) LIKE '%' || q || '%'
       OR store.id::text = q
    ORDER BY store.created_at DESC
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'owner'::text, profile.id, profile.store_id,
           coalesce(profile.full_name, profile.email, '(no name)')::text,
           coalesce(profile.email, profile.phone, '')::text
    FROM public.profiles profile
    JOIN public.user_roles role
      ON role.user_id = profile.id
     AND role.role IN ('owner'::app_role, 'admin'::app_role)
    WHERE lower(coalesce(profile.full_name, '')) LIKE '%' || q || '%'
       OR lower(coalesce(profile.email, '')) LIKE '%' || q || '%'
       OR lower(coalesce(profile.phone, '')) LIKE '%' || q || '%'
       OR profile.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'register'::text, device.id, device.store_id,
           device.label,
           concat_ws(' · ', device.platform, device.app_version, device.status)::text
    FROM public.device_registrations device
    WHERE lower(device.label) LIKE '%' || q || '%'
       OR lower(coalesce(device.platform, '')) LIKE '%' || q || '%'
       OR device.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'card reader'::text, terminal.id, terminal.store_id,
           terminal.label,
           coalesce(terminal.serial, terminal.provider, '')::text
    FROM public.payment_terminals terminal
    WHERE lower(terminal.label) LIKE '%' || q || '%'
       OR lower(coalesce(terminal.serial, '')) LIKE '%' || q || '%'
       OR terminal.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'subscription'::text, subscription.id, subscription.store_id,
           coalesce(subscription.stripe_subscription_id, subscription.id::text),
           concat_ws(' · ', subscription.status, subscription.environment)::text
    FROM public.subscriptions subscription
    WHERE lower(coalesce(subscription.stripe_subscription_id, '')) LIKE '%' || q || '%'
       OR lower(coalesce(subscription.stripe_customer_id, '')) LIKE '%' || q || '%'
       OR subscription.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'support'::text, ticket.id, ticket.store_id,
           concat('#', ticket.ticket_number, ' · ', ticket.subject)::text,
           concat_ws(' · ', ticket.requester_email, ticket.status, ticket.priority)::text
    FROM public.support_tickets ticket
    WHERE lower(ticket.subject) LIKE '%' || q || '%'
       OR lower(coalesce(ticket.requester_email, '')) LIKE '%' || q || '%'
       OR ticket.ticket_number::text = q
       OR ticket.id::text = q
    ORDER BY ticket.updated_at DESC
    LIMIT max_rows;
END
$$;

REVOKE ALL ON FUNCTION public.admin_global_search(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_global_search(text, int) TO authenticated;


-- =============================================================================
-- FILE: supabase/migrations/20260722150000_admin_reliability_privacy_fix.sql
-- =============================================================================

-- SEZA Admin reliability + privacy correction
-- Idempotent. Safe to apply after earlier Admin migrations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.admin_staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  department text NOT NULL DEFAULT 'Operations',
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('invited','active','inactive')),
  phone text,
  started_on date,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'global',
  company_name text NOT NULL DEFAULT 'SEZA POS',
  support_email text NOT NULL DEFAULT 'support@sezapos.com',
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com',
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com',
  timezone text NOT NULL DEFAULT 'America/New_York',
  default_trial_days integer NOT NULL DEFAULT 14 CHECK (default_trial_days BETWEEN 1 AND 90),
  support_sla_minutes integer NOT NULL DEFAULT 60 CHECK (support_sla_minutes BETWEEN 5 AND 10080),
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_staff_profiles TO service_role;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.admin_staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_staff_profiles (
  user_id, title, department, employment_status, phone, started_on
)
SELECT
  profile.id,
  'Founder & CEO',
  'Executive',
  'active',
  profile.phone,
  COALESCE(profile.created_at::date, CURRENT_DATE)
FROM public.profiles profile
WHERE lower(profile.email) = 'admin@sezapos.com'
ON CONFLICT (user_id) DO UPDATE
SET title = 'Founder & CEO',
    department = 'Executive',
    employment_status = 'active',
    phone = COALESCE(EXCLUDED.phone, public.admin_staff_profiles.phone),
    updated_at = now();

-- Support lifecycle columns required by Resolve / Close / live chat.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz;

ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'merchant';

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON public.support_ticket_events(ticket_id, created_at);

GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST immediately so newly created tables stop returning
-- "Could not find the table in the schema cache" after db push.
NOTIFY pgrst, 'reload schema';


-- =============================================================================
-- FILE: supabase/migrations/20260722190000_seza_major_release_readiness.sql
-- =============================================================================

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


-- =============================================================================
-- FILE: supabase/migrations/20260723212000_tenant_permission_scope.sql
-- =============================================================================

-- Prevent a role assigned in one merchant store from granting permissions in
-- another store selected by the same user profile/session.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND ur.store_id = public.current_store_id()
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;


-- =============================================================================
-- FILE: supabase/migrations/20260723213000_atomic_pos_sale_finalize.sql
-- =============================================================================

-- SEZA POS production safety: finalize a complete sale in one database
-- transaction. This replaces separate client inserts for sales, sale_items,
-- and sale_payments, preventing orphan sale headers and partial inventory
-- updates during network loss or process interruption.

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_sale jsonb,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_sale_id uuid;
  v_idempotency_key text;
  v_sale public.sales%ROWTYPE;
  v_created boolean := false;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_existing_items integer := 0;
  v_existing_payments integer := 0;
  v_items_total numeric := 0;
  v_payments_total numeric := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'p_sale must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A sale must contain at least one item' USING ERRCODE = '23514';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'p_payments must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_store_id := NULLIF(p_sale->>'store_id', '')::uuid;
  IF v_store_id IS NULL OR v_store_id IS DISTINCT FROM public.current_store_id() THEN
    RAISE EXCEPTION 'Sale store does not match the authenticated user store' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_user_id, 'sales.create') THEN
    RAISE EXCEPTION 'User does not have sales.create permission' USING ERRCODE = '42501';
  END IF;

  v_sale_id := COALESCE(NULLIF(p_sale->>'id', '')::uuid, gen_random_uuid());
  v_idempotency_key := NULLIF(btrim(p_sale->>'idempotency_key'), '');
  v_subtotal := COALESCE((p_sale->>'subtotal')::numeric, 0);
  v_tax := COALESCE((p_sale->>'tax')::numeric, 0);
  v_discount := COALESCE((p_sale->>'discount')::numeric, 0);
  v_total := COALESCE((p_sale->>'total')::numeric, 0);

  IF v_subtotal < 0 OR v_tax < 0 OR v_discount < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'Sale monetary values cannot be negative' USING ERRCODE = '23514';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Sale discount cannot exceed subtotal' USING ERRCODE = '23514';
  END IF;
  IF abs(v_total - (v_subtotal - v_discount + v_tax)) > 0.01 THEN
    RAISE EXCEPTION 'Sale total does not match subtotal, discount, and tax' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(p_sale->>'register_session_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.register_sessions
    WHERE id = (p_sale->>'register_session_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Register session does not belong to this store' USING ERRCODE = '23503';
  END IF;
  IF NULLIF(p_sale->>'customer_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = (p_sale->>'customer_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this store' USING ERRCODE = '23503';
  END IF;

  -- Validate every product before creating the header. Custom items use a
  -- null product_id and are allowed.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Sale item quantity must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE((v_item->>'unit_price')::numeric, -1) < 0
       OR COALESCE((v_item->>'line_total')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Sale item prices cannot be negative' USING ERRCODE = '23514';
    END IF;
    IF abs(
      (v_item->>'line_total')::numeric
      - ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric)
    ) > 0.01 THEN
      RAISE EXCEPTION 'Sale item line total is invalid' USING ERRCODE = '23514';
    END IF;
    v_items_total := v_items_total + (v_item->>'line_total')::numeric;
    IF NULLIF(btrim(v_item->>'product_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Sale item product_name is required' USING ERRCODE = '23502';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'Product % does not belong to this store', v_product_id USING ERRCODE = '23503';
    END IF;
  END LOOP;

  IF abs(v_items_total - v_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'Sale items do not match subtotal' USING ERRCODE = '23514';
  END IF;

  -- Lock every inventory row in a stable order and validate the aggregate
  -- quantity requested for each product. This closes the race where two
  -- terminals could both approve against the same stock before the trigger
  -- decremented it, and also handles carts containing the same product twice.
  PERFORM p.id
  FROM public.products p
  JOIN (
    SELECT
      NULLIF(item->>'product_id', '')::uuid AS product_id,
      sum((item->>'quantity')::numeric) AS quantity
    FROM jsonb_array_elements(p_items) AS rows(item)
    WHERE NULLIF(item->>'product_id', '') IS NOT NULL
    GROUP BY NULLIF(item->>'product_id', '')::uuid
  ) requested ON requested.product_id = p.id
  WHERE p.store_id = v_store_id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN (
      SELECT
        NULLIF(item->>'product_id', '')::uuid AS product_id,
        sum((item->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_items) AS rows(item)
      WHERE NULLIF(item->>'product_id', '') IS NOT NULL
      GROUP BY NULLIF(item->>'product_id', '')::uuid
    ) requested ON requested.product_id = p.id
    WHERE p.store_id = v_store_id
      AND p.track_inventory
      AND p.stock < requested.quantity
  ) THEN
    RAISE EXCEPTION 'Insufficient inventory for one or more products' USING ERRCODE = '23514';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF COALESCE((v_payment->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_payment->>'method', '') NOT IN ('cash','card','tap_to_pay','manual_card','gift_card','other') THEN
      RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '23514';
    END IF;
    v_payments_total := v_payments_total + (v_payment->>'amount')::numeric;
  END LOOP;
  IF v_total > 0 AND jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'A paid sale must include a payment allocation' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_payments) > 0 AND abs(v_payments_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Payment allocations do not match sale total' USING ERRCODE = '23514';
  END IF;

  -- Fast idempotent return/repair path.
  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_sale
    FROM public.sales
    WHERE idempotency_key = v_idempotency_key
    LIMIT 1;
  END IF;
  IF v_sale.id IS NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE id = v_sale_id LIMIT 1;
  END IF;

  IF v_sale.id IS NULL THEN
    BEGIN
      INSERT INTO public.sales (
        id,
        store_id,
        cashier_id,
        subtotal,
        tax,
        discount,
        total,
        payment_method,
        amount_tendered,
        change_due,
        terminal_ref,
        register_session_id,
        status,
        customer_name,
        idempotency_key,
        synced_from_offline,
        offline_created_at,
        customer_id,
        order_type,
        table_label,
        guest_count,
        kitchen_status,
        external_order_ref
      ) VALUES (
        v_sale_id,
        v_store_id,
        v_user_id,
        v_subtotal,
        v_tax,
        v_discount,
        v_total,
        COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash')::public.payment_method,
        NULLIF(p_sale->>'amount_tendered', '')::numeric,
        NULLIF(p_sale->>'change_due', '')::numeric,
        NULLIF(p_sale->>'terminal_ref', ''),
        NULLIF(p_sale->>'register_session_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'status', ''), 'completed'),
        NULLIF(p_sale->>'customer_name', ''),
        v_idempotency_key,
        COALESCE((p_sale->>'synced_from_offline')::boolean, false),
        NULLIF(p_sale->>'offline_created_at', '')::timestamptz,
        NULLIF(p_sale->>'customer_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'order_type', ''), 'retail'),
        NULLIF(p_sale->>'table_label', ''),
        NULLIF(p_sale->>'guest_count', '')::integer,
        COALESCE(NULLIF(p_sale->>'kitchen_status', ''), 'not_required'),
        NULLIF(p_sale->>'external_order_ref', '')
      )
      RETURNING * INTO v_sale;
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent retry may have won the unique idempotency race.
      SELECT * INTO v_sale
      FROM public.sales
      WHERE id = v_sale_id
         OR (v_idempotency_key IS NOT NULL AND idempotency_key = v_idempotency_key)
      ORDER BY (idempotency_key = v_idempotency_key) DESC NULLS LAST
      LIMIT 1;
      IF v_sale.id IS NULL THEN
        RAISE;
      END IF;
    END;
  END IF;

  IF v_sale.store_id IS DISTINCT FROM v_store_id OR v_sale.cashier_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another sale context' USING ERRCODE = '42501';
  END IF;
  IF abs(v_sale.subtotal - v_subtotal) > 0.01
     OR abs(v_sale.tax - v_tax) > 0.01
     OR abs(v_sale.discount - v_discount) > 0.01
     OR abs(v_sale.total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Idempotency key payload does not match the original sale' USING ERRCODE = '23514';
  END IF;

  -- Repair an old partial header only when it has zero items. New calls insert
  -- all items atomically inside this same transaction.
  SELECT count(*) INTO v_existing_items FROM public.sale_items WHERE sale_id = v_sale.id;
  IF v_existing_items = 0 THEN
    INSERT INTO public.sale_items (
      sale_id, product_id, product_name, quantity, unit_price, line_total
    )
    SELECT
      v_sale.id,
      NULLIF(item->>'product_id', '')::uuid,
      item->>'product_name',
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'line_total')::numeric
    FROM jsonb_array_elements(p_items) AS rows(item);
  ELSIF v_created THEN
    RAISE EXCEPTION 'Unexpected sale item state for newly created sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_payments FROM public.sale_payments WHERE sale_id = v_sale.id;
  IF v_existing_payments = 0 AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
    LOOP
      INSERT INTO public.sale_payments (
        sale_id,
        store_id,
        method,
        amount,
        provider,
        provider_reference,
        status,
        metadata
      ) VALUES (
        v_sale.id,
        v_store_id,
        v_payment->>'method',
        (v_payment->>'amount')::numeric,
        NULLIF(v_payment->>'provider', ''),
        NULLIF(v_payment->>'provider_reference', ''),
        COALESCE(NULLIF(v_payment->>'status', ''), 'completed'),
        COALESCE(v_payment->'metadata', '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'receipt_number', v_sale.receipt_number,
    'created_at', v_sale.created_at,
    'store_id', v_sale.store_id,
    'already_existed', NOT v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) IS
  'Atomically creates or idempotently repairs a POS sale, items, payments, and inventory effects.';


-- =============================================================================
-- FILE: supabase/migrations/20260723214500_support_and_platform_consistency.sql
-- =============================================================================

-- Normalize production support/admin state after deployments where the UI
-- reached production before every July support migration.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'global',
  company_name text NOT NULL DEFAULT 'SEZA POS',
  support_email text NOT NULL DEFAULT 'support@sezapos.com',
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com',
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com',
  timezone text NOT NULL DEFAULT 'America/New_York',
  default_trial_days integer NOT NULL DEFAULT 14 CHECK (default_trial_days BETWEEN 1 AND 90),
  support_sla_minutes integer NOT NULL DEFAULT 60 CHECK (support_sla_minutes BETWEEN 5 AND 10080),
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS resolution_code text;

UPDATE public.support_tickets
SET
  chat_status = CASE
    WHEN status IN ('resolved', 'closed') THEN 'ended'
    WHEN chat_status = 'ended' THEN 'active'
    ELSE COALESCE(chat_status, 'waiting')
  END,
  priority = CASE WHEN status IN ('resolved', 'closed') THEN 'normal' ELSE priority END,
  last_message_at = COALESCE(last_message_at, updated_at, created_at),
  chat_ended_at = CASE
    WHEN status IN ('resolved', 'closed') THEN COALESCE(chat_ended_at, resolved_at, closed_at, updated_at)
    ELSE NULL
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_tickets_chat_status_check'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_chat_status_check
      CHECK (chat_status IN ('waiting', 'active', 'ended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS support_tickets_chat_activity_idx
  ON public.support_tickets(chat_status, last_message_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'support_tickets'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'support_ticket_notes'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
  END IF;
END $$;


-- =============================================================================
-- FILE: supabase/migrations/20260723220000_legal_acceptance_records.sql
-- =============================================================================

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


-- =============================================================================
-- FILE: supabase/migrations/20260724051233_9df00199-761b-4c5a-a12a-7763336d0568.sql
-- =============================================================================

-- v1.3.0 compatibility pre-req: minimum schema required by
-- 20260723213000_atomic_pos_sale_finalize and 20260723214500_support_and_platform_consistency.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS table_label text,
  ADD COLUMN IF NOT EXISTS guest_count integer,
  ADD COLUMN IF NOT EXISTS kitchen_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS external_order_ref text;

CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS sales_external_order_ref_idx ON public.sales(external_order_ref);

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_store_id_idx ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS customers_store_email_idx ON public.customers(store_id, lower(email));
CREATE INDEX IF NOT EXISTS customers_store_phone_idx ON public.customers(store_id, phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers_select') THEN
    CREATE POLICY customers_select ON public.customers
      FOR SELECT TO authenticated
      USING (store_id = public.current_store_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers_insert') THEN
    CREATE POLICY customers_insert ON public.customers
      FOR INSERT TO authenticated
      WITH CHECK (store_id = public.current_store_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers_update') THEN
    CREATE POLICY customers_update ON public.customers
      FOR UPDATE TO authenticated
      USING (store_id = public.current_store_id())
      WITH CHECK (store_id = public.current_store_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers_delete_mgmt') THEN
    CREATE POLICY customers_delete_mgmt ON public.customers
      FOR DELETE TO authenticated
      USING (
        store_id = public.current_store_id()
        AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers_super_admin_select') THEN
    CREATE POLICY customers_super_admin_select ON public.customers
      FOR SELECT TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS customers_set_updated_at ON public.customers;
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_customer_id_fkey' AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'completed',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_store_id_idx ON public.sale_payments(store_id);

GRANT SELECT, INSERT, UPDATE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sale_payments' AND policyname='sale_payments_select') THEN
    CREATE POLICY sale_payments_select ON public.sale_payments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.sales s
          WHERE s.id = sale_payments.sale_id
            AND s.store_id = public.current_store_id()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sale_payments' AND policyname='sale_payments_insert') THEN
    CREATE POLICY sale_payments_insert ON public.sale_payments
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.sales s
          WHERE s.id = sale_payments.sale_id
            AND s.cashier_id = auth.uid()
            AND s.store_id = public.current_store_id()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sale_payments' AND policyname='sale_payments_update_mgmt') THEN
    CREATE POLICY sale_payments_update_mgmt ON public.sale_payments
      FOR UPDATE TO authenticated
      USING (
        store_id = public.current_store_id()
        AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
      )
      WITH CHECK (
        store_id = public.current_store_id()
        AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sale_payments' AND policyname='sale_payments_super_admin_select') THEN
    CREATE POLICY sale_payments_super_admin_select ON public.sale_payments
      FOR SELECT TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS sale_payments_set_updated_at ON public.sale_payments;
CREATE TRIGGER sale_payments_set_updated_at
  BEFORE UPDATE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================================
-- FILE: supabase/migrations/20260724051321_6aaa5813-fbb8-4341-99b6-d0413937a03b.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND ur.store_id = public.current_store_id()
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- =============================================================================
-- FILE: supabase/migrations/20260724051441_eed3acd4-927f-4027-97f4-7bebfc94bc7d.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_sale jsonb,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_sale_id uuid;
  v_idempotency_key text;
  v_sale public.sales%ROWTYPE;
  v_created boolean := false;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_existing_items integer := 0;
  v_existing_payments integer := 0;
  v_items_total numeric := 0;
  v_payments_total numeric := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'p_sale must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A sale must contain at least one item' USING ERRCODE = '23514';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'p_payments must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_store_id := NULLIF(p_sale->>'store_id', '')::uuid;
  IF v_store_id IS NULL OR v_store_id IS DISTINCT FROM public.current_store_id() THEN
    RAISE EXCEPTION 'Sale store does not match the authenticated user store' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_user_id, 'sales.create') THEN
    RAISE EXCEPTION 'User does not have sales.create permission' USING ERRCODE = '42501';
  END IF;

  v_sale_id := COALESCE(NULLIF(p_sale->>'id', '')::uuid, gen_random_uuid());
  v_idempotency_key := NULLIF(btrim(p_sale->>'idempotency_key'), '');
  v_subtotal := COALESCE((p_sale->>'subtotal')::numeric, 0);
  v_tax := COALESCE((p_sale->>'tax')::numeric, 0);
  v_discount := COALESCE((p_sale->>'discount')::numeric, 0);
  v_total := COALESCE((p_sale->>'total')::numeric, 0);

  IF v_subtotal < 0 OR v_tax < 0 OR v_discount < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'Sale monetary values cannot be negative' USING ERRCODE = '23514';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Sale discount cannot exceed subtotal' USING ERRCODE = '23514';
  END IF;
  IF abs(v_total - (v_subtotal - v_discount + v_tax)) > 0.01 THEN
    RAISE EXCEPTION 'Sale total does not match subtotal, discount, and tax' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(p_sale->>'register_session_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.register_sessions
    WHERE id = (p_sale->>'register_session_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Register session does not belong to this store' USING ERRCODE = '23503';
  END IF;
  IF NULLIF(p_sale->>'customer_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = (p_sale->>'customer_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this store' USING ERRCODE = '23503';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Sale item quantity must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE((v_item->>'unit_price')::numeric, -1) < 0
       OR COALESCE((v_item->>'line_total')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Sale item prices cannot be negative' USING ERRCODE = '23514';
    END IF;
    IF abs(
      (v_item->>'line_total')::numeric
      - ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric)
    ) > 0.01 THEN
      RAISE EXCEPTION 'Sale item line total is invalid' USING ERRCODE = '23514';
    END IF;
    v_items_total := v_items_total + (v_item->>'line_total')::numeric;
    IF NULLIF(btrim(v_item->>'product_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Sale item product_name is required' USING ERRCODE = '23502';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'Product % does not belong to this store', v_product_id USING ERRCODE = '23503';
    END IF;
  END LOOP;

  IF abs(v_items_total - v_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'Sale items do not match subtotal' USING ERRCODE = '23514';
  END IF;

  PERFORM p.id
  FROM public.products p
  JOIN (
    SELECT
      NULLIF(item->>'product_id', '')::uuid AS product_id,
      sum((item->>'quantity')::numeric) AS quantity
    FROM jsonb_array_elements(p_items) AS rows(item)
    WHERE NULLIF(item->>'product_id', '') IS NOT NULL
    GROUP BY NULLIF(item->>'product_id', '')::uuid
  ) requested ON requested.product_id = p.id
  WHERE p.store_id = v_store_id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN (
      SELECT
        NULLIF(item->>'product_id', '')::uuid AS product_id,
        sum((item->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_items) AS rows(item)
      WHERE NULLIF(item->>'product_id', '') IS NOT NULL
      GROUP BY NULLIF(item->>'product_id', '')::uuid
    ) requested ON requested.product_id = p.id
    WHERE p.store_id = v_store_id
      AND p.track_inventory
      AND p.stock < requested.quantity
  ) THEN
    RAISE EXCEPTION 'Insufficient inventory for one or more products' USING ERRCODE = '23514';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF COALESCE((v_payment->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_payment->>'method', '') NOT IN ('cash','card','tap_to_pay','manual_card','gift_card','other') THEN
      RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '23514';
    END IF;
    v_payments_total := v_payments_total + (v_payment->>'amount')::numeric;
  END LOOP;
  IF v_total > 0 AND jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'A paid sale must include a payment allocation' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_payments) > 0 AND abs(v_payments_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Payment allocations do not match sale total' USING ERRCODE = '23514';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE idempotency_key = v_idempotency_key LIMIT 1;
  END IF;
  IF v_sale.id IS NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE id = v_sale_id LIMIT 1;
  END IF;

  IF v_sale.id IS NULL THEN
    BEGIN
      INSERT INTO public.sales (
        id, store_id, cashier_id, subtotal, tax, discount, total, payment_method,
        amount_tendered, change_due, terminal_ref, register_session_id, status,
        customer_name, idempotency_key, synced_from_offline, offline_created_at,
        customer_id, order_type, table_label, guest_count, kitchen_status, external_order_ref
      ) VALUES (
        v_sale_id, v_store_id, v_user_id, v_subtotal, v_tax, v_discount, v_total,
        COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash')::public.payment_method,
        NULLIF(p_sale->>'amount_tendered', '')::numeric,
        NULLIF(p_sale->>'change_due', '')::numeric,
        NULLIF(p_sale->>'terminal_ref', ''),
        NULLIF(p_sale->>'register_session_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'status', ''), 'completed'),
        NULLIF(p_sale->>'customer_name', ''),
        v_idempotency_key,
        COALESCE((p_sale->>'synced_from_offline')::boolean, false),
        NULLIF(p_sale->>'offline_created_at', '')::timestamptz,
        NULLIF(p_sale->>'customer_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'order_type', ''), 'retail'),
        NULLIF(p_sale->>'table_label', ''),
        NULLIF(p_sale->>'guest_count', '')::integer,
        COALESCE(NULLIF(p_sale->>'kitchen_status', ''), 'not_required'),
        NULLIF(p_sale->>'external_order_ref', '')
      )
      RETURNING * INTO v_sale;
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_sale
      FROM public.sales
      WHERE id = v_sale_id
         OR (v_idempotency_key IS NOT NULL AND idempotency_key = v_idempotency_key)
      ORDER BY (idempotency_key = v_idempotency_key) DESC NULLS LAST
      LIMIT 1;
      IF v_sale.id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF v_sale.store_id IS DISTINCT FROM v_store_id OR v_sale.cashier_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another sale context' USING ERRCODE = '42501';
  END IF;
  IF abs(v_sale.subtotal - v_subtotal) > 0.01
     OR abs(v_sale.tax - v_tax) > 0.01
     OR abs(v_sale.discount - v_discount) > 0.01
     OR abs(v_sale.total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Idempotency key payload does not match the original sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_items FROM public.sale_items WHERE sale_id = v_sale.id;
  IF v_existing_items = 0 THEN
    INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
    SELECT v_sale.id,
      NULLIF(item->>'product_id', '')::uuid,
      item->>'product_name',
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'line_total')::numeric
    FROM jsonb_array_elements(p_items) AS rows(item);
  ELSIF v_created THEN
    RAISE EXCEPTION 'Unexpected sale item state for newly created sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_payments FROM public.sale_payments WHERE sale_id = v_sale.id;
  IF v_existing_payments = 0 AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
    LOOP
      INSERT INTO public.sale_payments (sale_id, store_id, method, amount, provider, provider_reference, status, metadata)
      VALUES (
        v_sale.id, v_store_id,
        v_payment->>'method',
        (v_payment->>'amount')::numeric,
        NULLIF(v_payment->>'provider', ''),
        NULLIF(v_payment->>'provider_reference', ''),
        COALESCE(NULLIF(v_payment->>'status', ''), 'completed'),
        COALESCE(v_payment->'metadata', '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'receipt_number', v_sale.receipt_number,
    'created_at', v_sale.created_at,
    'store_id', v_sale.store_id,
    'already_existed', NOT v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) IS
  'Atomically creates or idempotently repairs a POS sale, items, payments, and inventory effects.';

-- =============================================================================
-- FILE: supabase/migrations/20260724051525_9dd5dc3c-141a-4442-81b7-31a95b5955fc.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'global',
  company_name text NOT NULL DEFAULT 'SEZA POS',
  support_email text NOT NULL DEFAULT 'support@sezapos.com',
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com',
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com',
  timezone text NOT NULL DEFAULT 'America/New_York',
  default_trial_days integer NOT NULL DEFAULT 14 CHECK (default_trial_days BETWEEN 1 AND 90),
  support_sla_minutes integer NOT NULL DEFAULT 60 CHECK (support_sla_minutes BETWEEN 5 AND 10080),
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS resolution_code text;

UPDATE public.support_tickets
SET
  chat_status = CASE
    WHEN status IN ('resolved', 'closed') THEN 'ended'
    WHEN chat_status = 'ended' THEN 'active'
    ELSE COALESCE(chat_status, 'waiting')
  END,
  priority = CASE WHEN status IN ('resolved', 'closed') THEN 'normal' ELSE priority END,
  last_message_at = COALESCE(last_message_at, updated_at, created_at),
  chat_ended_at = CASE
    WHEN status IN ('resolved', 'closed') THEN COALESCE(chat_ended_at, resolved_at, closed_at, updated_at)
    ELSE NULL
  END;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_tickets_chat_status_check'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_chat_status_check
      CHECK (chat_status IN ('waiting', 'active', 'ended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS support_tickets_chat_activity_idx
  ON public.support_tickets(chat_status, last_message_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_tickets'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_ticket_notes'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
  END IF;
END $$;

-- =============================================================================
-- FILE: supabase/migrations/20260724051605_43890894-b4cf-485e-8340-8f9330f718a1.sql
-- =============================================================================

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
  IF v_accepted_at < now() - interval '24 hours' OR v_accepted_at > now() + interval '5 minutes' THEN
    v_accepted_at := now();
  END IF;

  INSERT INTO public.legal_acceptances (user_id, store_id, terms_version, privacy_version, accepted_at, source)
  VALUES (v_user_id, v_store_id, btrim(p_terms_version), btrim(p_privacy_version), v_accepted_at, p_source)
  ON CONFLICT (user_id, store_id, terms_version, privacy_version) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
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

-- =============================================================================
-- FILE: supabase/migrations/20260724053904_16d30778-7d80-4df2-9dea-7ee8d2a37a08.sql
-- =============================================================================

-- Revoke anon EXECUTE on SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.record_legal_acceptance(text, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(text, text, timestamptz, text) TO authenticated;

-- Remove device_registrations from realtime publication to prevent secret_hash leakage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'device_registrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.device_registrations;
  END IF;
END $$;

-- =============================================================================
-- FILE: supabase/migrations/20260724074623_9faffbeb-83cd-40a7-a425-2a17bf72e671.sql
-- =============================================================================

DROP POLICY IF EXISTS ticket_notes_merchant_view ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_view ON public.support_ticket_notes
FOR SELECT
USING (
  internal = false
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_notes.ticket_id
      AND t.store_id = public.current_store_id()
  )
);

-- =============================================================================
-- FILE: supabase/migrations/20260724123000_public_website_live_chat.sql
-- =============================================================================

-- Public website live chat support.
-- Visitors are authenticated with a random opaque token that is only stored
-- in the browser session. The database stores a SHA-256 hash of that token.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_guest_token_hash_idx
  ON public.support_tickets (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_website_chat_activity_idx
  ON public.support_tickets (source, chat_status, last_message_at DESC)
  WHERE source = 'website_live_chat';

CREATE INDEX IF NOT EXISTS support_tickets_visitor_ip_rate_idx
  ON public.support_tickets (visitor_ip_hash, created_at DESC)
  WHERE source = 'website_live_chat' AND visitor_ip_hash IS NOT NULL;

COMMENT ON COLUMN public.support_tickets.visitor_name IS
  'Name supplied by an unauthenticated public website live-chat visitor.';
COMMENT ON COLUMN public.support_tickets.visitor_phone IS
  'Phone supplied by an unauthenticated public website live-chat visitor.';
COMMENT ON COLUMN public.support_tickets.guest_token_hash IS
  'SHA-256 hash of the opaque browser chat token; the plaintext token is never stored.';
COMMENT ON COLUMN public.support_tickets.source IS
  'Origin of the support case, for example website_live_chat or merchant_app.';


-- =============================================================================
-- FILE: supabase/migrations/20260725010000_api_rate_limits_and_security.sql
-- =============================================================================

-- SEZA API abuse protection.
-- Stores hashed identifiers only. Raw IP addresses, emails, device secrets,
-- passwords, and PINs are never written to this table.

CREATE TABLE IF NOT EXISTS public.api_rate_limit_buckets (
  key_hash text PRIMARY KEY,
  scope text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limit_buckets FROM anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limit_buckets TO service_role;

CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_updated_idx
  ON public.api_rate_limit_buckets (updated_at);
CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_scope_idx
  ON public.api_rate_limit_buckets (scope, updated_at DESC);

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_key_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer DEFAULT 0
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket public.api_rate_limit_buckets%ROWTYPE;
  v_window interval;
  v_block interval;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 OR length(p_key_hash) > 128 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_scope IS NULL OR length(btrim(p_scope)) = 0 OR length(p_scope) > 120 THEN
    RAISE EXCEPTION 'Invalid rate-limit scope';
  END IF;
  IF p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid rate-limit maximum';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  IF p_block_seconds < 0 OR p_block_seconds > 604800 THEN
    RAISE EXCEPTION 'Invalid rate-limit block duration';
  END IF;

  v_window := make_interval(secs => p_window_seconds);
  v_block := make_interval(secs => p_block_seconds);

  INSERT INTO public.api_rate_limit_buckets (
    key_hash, scope, window_started_at, request_count, blocked_until, updated_at
  ) VALUES (
    p_key_hash, p_scope, v_now, 0, NULL, v_now
  )
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_bucket
  FROM public.api_rate_limit_buckets
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF v_bucket.blocked_until IS NOT NULL AND v_bucket.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0,
      GREATEST(1, ceil(extract(epoch FROM (v_bucket.blocked_until - v_now)))::integer);
    RETURN;
  END IF;

  IF v_bucket.window_started_at + v_window <= v_now THEN
    UPDATE public.api_rate_limit_buckets
    SET scope = p_scope,
        window_started_at = v_now,
        request_count = 1,
        blocked_until = NULL,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT true, GREATEST(0, p_limit - 1), 0;
    RETURN;
  END IF;

  IF v_bucket.request_count >= p_limit THEN
    UPDATE public.api_rate_limit_buckets
    SET blocked_until = CASE
          WHEN p_block_seconds > 0 THEN v_now + v_block
          ELSE v_bucket.window_started_at + v_window
        END,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT false, 0,
      GREATEST(
        1,
        ceil(extract(epoch FROM (
          CASE WHEN p_block_seconds > 0 THEN v_now + v_block
               ELSE v_bucket.window_started_at + v_window END
          - v_now
        )))::integer
      );
    RETURN;
  END IF;

  UPDATE public.api_rate_limit_buckets
  SET scope = p_scope,
      request_count = request_count + 1,
      blocked_until = NULL,
      updated_at = v_now
  WHERE key_hash = p_key_hash
  RETURNING * INTO v_bucket;

  RETURN QUERY SELECT true, GREATEST(0, p_limit - v_bucket.request_count), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limit_buckets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.api_rate_limit_buckets
  WHERE updated_at < now() - interval '7 days'
    AND (blocked_until IS NULL OR blocked_until < now() - interval '1 day');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_api_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limit_buckets() TO service_role;

COMMENT ON TABLE public.api_rate_limit_buckets IS
  'Server-only, hashed API abuse counters. Never stores raw personal identifiers.';


-- =============================================================================
-- FILE: supabase/migrations/20260725011000_deprecate_raw_admin_login_attempts.sql
-- =============================================================================

-- The original admin login limiter stored raw email/IP/user-agent values.
-- SEZA now uses api_rate_limit_buckets, which stores only SHA-256 identifiers,
-- and successful logins are recorded in audit_log. Lock and clear the legacy
-- table so historical personal identifiers cannot be queried from the client.

DO $$
BEGIN
  IF to_regclass('public.admin_login_attempts') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_login_attempts FROM anon, authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.admin_login_attempts TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "Super admins can read login attempts" ON public.admin_login_attempts';
    EXECUTE 'TRUNCATE TABLE public.admin_login_attempts';
  END IF;
END
$$;


-- =============================================================================
-- FILE: supabase/migrations/20260725012000_authenticated_write_guards.sql
-- =============================================================================

-- Backstop limits for browser/APK writes that use the SEZA data API
-- directly. HTTP/server-function limits remain the first layer. These triggers
-- protect key tables even if a caller bypasses the normal SEZA UI.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.enforce_authenticated_write_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_limit integer := TG_ARGV[0]::integer;
  v_window integer := TG_ARGV[1]::integer;
  v_block integer := TG_ARGV[2]::integer;
  v_key text;
  v_allowed boolean;
  v_remaining integer;
  v_retry integer;
BEGIN
  -- Service-role/internal work has no auth.uid() and is already protected by
  -- the server endpoint that invoked it.
  IF v_actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_key := encode(
    digest(v_actor::text || ':' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || TG_OP, 'sha256'),
    'hex'
  );

  SELECT allowed, remaining, retry_after_seconds
    INTO v_allowed, v_remaining, v_retry
  FROM public.consume_api_rate_limit(
    v_key,
    'db.write.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    v_limit,
    v_window,
    v_block
  );

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'RATE_LIMITED',
      DETAIL = 'retry_after_seconds=' || GREATEST(1, COALESCE(v_retry, 1));
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_authenticated_write_rate_limit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_authenticated_write_rate_limit()
  TO service_role;

DO $$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN
    SELECT * FROM (VALUES
      ('products',             2000, 3600,  300),
      ('categories',            300, 3600,  300),
      ('customers',             600, 3600,  300),
      ('support_tickets',          5, 3600, 3600),
      ('support_ticket_notes',   120, 3600,  600),
      ('cash_movements',         120, 3600,  600),
      ('time_entries',           240, 3600,  600),
      ('refunds',                 60, 3600, 1800),
      ('legal_acceptances',       20, 3600, 3600)
    ) AS limits(table_name, max_requests, window_seconds, block_seconds)
  LOOP
    IF to_regclass('public.' || v_item.table_name) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.%I',
        'seza_write_limit_' || v_item.table_name,
        v_item.table_name
      );
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION public.enforce_authenticated_write_rate_limit(%L, %L, %L)',
        'seza_write_limit_' || v_item.table_name,
        v_item.table_name,
        v_item.max_requests,
        v_item.window_seconds,
        v_item.block_seconds
      );
    END IF;
  END LOOP;
END
$$;


-- =============================================================================
-- FILE: supabase/migrations/20260725043000_public_api_rate_limits.sql
-- =============================================================================

-- SEZA POS public API abuse protection.
-- Stores only SHA-256 bucket keys. Raw IP addresses, PINs, pairing codes, and
-- device secrets are never written to this table.

CREATE TABLE IF NOT EXISTS public.public_api_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE public.public_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_public_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_count integer;
  v_started timestamptz;
BEGIN
  IF p_scope IS NULL OR length(p_scope) < 1 OR length(p_scope) > 100 THEN
    RAISE EXCEPTION 'Invalid rate-limit scope';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Invalid rate-limit limit';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  INSERT INTO public.public_api_rate_limits AS limits (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (p_scope, p_key_hash, v_now, 1, v_now)
  ON CONFLICT (scope, key_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - v_window THEN v_now
      ELSE limits.window_started_at
    END,
    request_count = CASE
      WHEN limits.window_started_at <= v_now - v_window THEN 1
      ELSE limits.request_count + 1
    END,
    updated_at = v_now
  RETURNING request_count, window_started_at
  INTO v_count, v_started;

  allowed := v_count <= p_limit;
  remaining := greatest(0, p_limit - v_count);
  retry_after_seconds := CASE
    WHEN allowed THEN 0
    ELSE greatest(1, ceil(extract(epoch FROM ((v_started + v_window) - v_now)))::integer)
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer)
  TO service_role;

COMMENT ON TABLE public.public_api_rate_limits IS
  'Hashed fixed-window counters for public SEZA API endpoints.';
COMMENT ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer) IS
  'Atomically consumes one request from a hashed public API rate-limit bucket.';

-- Keep the table bounded. Safe to run from a daily scheduled job; this initial
-- cleanup also removes stale rows when the migration is applied.
DELETE FROM public.public_api_rate_limits
WHERE updated_at < now() - interval '7 days';


-- =============================================================================
-- FILE: supabase/migrations/20260725232006_739aa430-bb9d-4b63-8c0c-b039ae7193b6.sql
-- =============================================================================

ALTER POLICY ticket_notes_merchant_view ON public.support_ticket_notes TO authenticated;

-- =============================================================================
-- FILE: supabase/migrations/20260725234328_432dbca1-1a8d-489f-8048-ca728e9bc20c.sql
-- =============================================================================

-- Restrict employee self-service updates on public.profiles to safe personal
-- columns using column-level UPDATE grants. Owner/admin/manager employee
-- management continues to run through service_role server functions.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  first_name,
  last_name,
  full_name,
  phone,
  photo_url,
  avatar_url,
  preferred_language,
  preferred_locale,
  updated_at
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

-- Keep the defence-in-depth trigger and replace the self-update policy with an
-- equivalent, explicitly scoped one (no duplicate policies).
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() AND status = 'active')
WITH CHECK (
  id = auth.uid()
  AND status = 'active'
  AND store_id = (SELECT p.store_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- =============================================================================
-- FILE: supabase/migrations/20260726001909_299e3ba8-c673-45e3-9c9e-563001778f47.sql
-- =============================================================================

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

-- =============================================================================
-- FILE: supabase/migrations/20260726070000_secure_customer_display_realtime.sql
-- =============================================================================

-- Secure the customer-facing display channel.
--
-- Previously, customer-display:<store_id> was a public Broadcast channel.
-- Anyone with the browser publishable key and a store UUID could join the
-- topic and spoof cart/payment-complete messages. These policies require an
-- authenticated user who belongs to the store encoded in the channel topic.

DROP POLICY IF EXISTS "store users can receive customer display broadcasts"
  ON realtime.messages;
DROP POLICY IF EXISTS "store users can send customer display broadcasts"
  ON realtime.messages;

CREATE POLICY "store users can receive customer display broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~
    '^customer-display:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  AND public.current_store_id() =
    split_part((SELECT realtime.topic()), ':', 2)::uuid
);

CREATE POLICY "store users can send customer display broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~
    '^customer-display:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  AND public.current_store_id() =
    split_part((SELECT realtime.topic()), ':', 2)::uuid
);


-- =============================================================================
-- FILE: supabase/migrations/20260726083000_repair_public_live_chat_schema.sql
-- =============================================================================

BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS chat_status text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz;

ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_guest_token_hash_idx
  ON public.support_tickets (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_public_chat_queue_idx
  ON public.support_tickets (source, chat_status, last_message_at DESC)
  WHERE source = 'website_live_chat';

UPDATE public.support_ticket_notes
SET sender_kind = CASE WHEN author_id IS NULL THEN 'visitor' ELSE 'admin' END
WHERE sender_kind IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;


-- =============================================================================
-- FILE: supabase/migrations/20260726100000_harden_public_live_chat_compatibility.sql
-- =============================================================================

BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS chat_status text DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz;

ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_guest_token_hash_idx
  ON public.support_tickets (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_public_chat_queue_idx
  ON public.support_tickets (source, chat_status, last_message_at DESC)
  WHERE source = 'website_live_chat';

UPDATE public.support_ticket_notes
SET sender_kind = CASE WHEN author_id IS NULL THEN 'visitor' ELSE 'admin' END
WHERE sender_kind IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- FILE: supabase/migrations/20260726214500_payments_security_and_terminal_setup.sql
-- =============================================================================

BEGIN;

ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS setup_source text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  store_id uuid,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  verification_method text,
  success boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_step_up_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  store_id uuid,
  user_id uuid NOT NULL,
  purpose text NOT NULL,
  method text NOT NULL,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_step_up_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_security_events_owner_read ON public.payment_security_events;
CREATE POLICY payment_security_events_owner_read ON public.payment_security_events
FOR SELECT TO authenticated
USING (actor_user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS payment_step_up_sessions_self ON public.payment_step_up_sessions;
CREATE POLICY payment_step_up_sessions_self ON public.payment_step_up_sessions
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS payment_step_up_sessions_user_expires_idx
ON public.payment_step_up_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS payment_security_events_actor_created_idx
ON public.payment_security_events (actor_user_id, created_at DESC);

COMMENT ON TABLE public.payment_step_up_sessions IS
'Short-lived owner verification records for payout, processor credential, and terminal configuration changes. Never stores bank account numbers or one-time codes.';

NOTIFY pgrst, 'reload schema';
COMMIT;


-- =============================================================================
-- FILE: supabase/migrations/20260730013000_trial_passkey_ip_security.sql
-- =============================================================================

-- SEZA POS: one trial per verified business, IP signup monitoring, and passkeys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_trial_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_fingerprint text NOT NULL UNIQUE,
  normalized_business_name text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','trial_active','trial_used','paid','blocked','review')),
  first_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_trial_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_trial_registry FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_business_trial_registry_status ON public.business_trial_registry(status);

CREATE TABLE IF NOT EXISTS public.signup_risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text NOT NULL,
  email_hash text,
  business_fingerprint text,
  user_agent_hash text,
  country_code text,
  risk_score integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_risk_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_risk_events FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_signup_risk_ip_time ON public.signup_risk_events(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_risk_business ON public.signup_risk_events(business_fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Passkey',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own passkeys" ON public.passkey_credentials FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners rename own passkeys" ON public.passkey_credentials FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners remove own passkeys" ON public.passkey_credentials FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE INSERT ON public.passkey_credentials FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON public.passkey_credentials(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('registration','authentication')),
  challenge text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email_hash text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.passkey_challenges FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expiry ON public.passkey_challenges(expires_at);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_fingerprint text,
  ADD COLUMN IF NOT EXISTS business_verification_status text NOT NULL DEFAULT 'pending'
    CHECK (business_verification_status IN ('pending','verified','review','rejected')),
  ADD COLUMN IF NOT EXISTS trial_eligibility text NOT NULL DEFAULT 'pending'
    CHECK (trial_eligibility IN ('pending','eligible','used','blocked','review'));
CREATE INDEX IF NOT EXISTS idx_stores_business_fingerprint ON public.stores(business_fingerprint);

-- Start the trial only after Supabase confirms the owner's email and only when
-- the permanent business registry says this business has not used a trial.
CREATE OR REPLACE FUNCTION public.activate_verified_business_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_fp text;
  v_days integer := 14;
  v_registry public.business_trial_registry%ROWTYPE;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.store_id INTO v_store_id FROM public.profiles p WHERE p.id = NEW.id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.business_fingerprint INTO v_fp FROM public.stores s WHERE s.id = v_store_id;
  IF v_fp IS NULL OR v_fp = '' THEN
    UPDATE public.stores SET trial_eligibility='review', plan_status='inactive', trial_ends_at=NULL WHERE id=v_store_id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(default_trial_days,14) INTO v_days FROM public.platform_settings WHERE id='global';
  INSERT INTO public.business_trial_registry (business_fingerprint, normalized_business_name, first_user_id, first_store_id)
  VALUES (v_fp, lower(trim(COALESCE(NEW.raw_user_meta_data->>'business_name','business'))), NEW.id, v_store_id)
  ON CONFLICT (business_fingerprint) DO NOTHING;

  SELECT * INTO v_registry FROM public.business_trial_registry WHERE business_fingerprint=v_fp FOR UPDATE;
  IF v_registry.status IN ('trial_used','trial_active','paid','blocked')
     AND v_registry.first_user_id IS DISTINCT FROM NEW.id THEN
    UPDATE public.stores SET trial_eligibility='used', plan_status='inactive', trial_ends_at=NULL, plan_period_end=NULL WHERE id=v_store_id;
    RETURN NEW;
  END IF;

  UPDATE public.business_trial_registry
     SET status='trial_active', first_user_id=COALESCE(first_user_id,NEW.id), first_store_id=COALESCE(first_store_id,v_store_id),
         trial_started_at=COALESCE(trial_started_at,now()), trial_ends_at=COALESCE(trial_ends_at,now()+make_interval(days=>v_days)), updated_at=now()
   WHERE business_fingerprint=v_fp;

  UPDATE public.stores
     SET business_verification_status='verified', trial_eligibility='eligible', plan_tier='trial_pro', plan_status='trialing',
         trial_ends_at=COALESCE(trial_ends_at,now()+make_interval(days=>v_days)),
         plan_period_end=COALESCE(plan_period_end,now()+make_interval(days=>v_days))
   WHERE id=v_store_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS seza_activate_trial_after_email_verification ON auth.users;
CREATE TRIGGER seza_activate_trial_after_email_verification
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.activate_verified_business_trial();

-- New accounts are provisioned without an active trial. The trigger above
-- activates it only after email confirmation and registry eligibility.
CREATE OR REPLACE FUNCTION public.seza_prepare_new_store_trial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.business_fingerprint IS NOT NULL THEN
    NEW.plan_status := 'inactive';
    NEW.trial_ends_at := NULL;
    NEW.plan_period_end := NULL;
    NEW.trial_eligibility := 'pending';
    NEW.business_verification_status := 'pending';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seza_prepare_new_store_trial_trigger ON public.stores;
CREATE TRIGGER seza_prepare_new_store_trial_trigger BEFORE INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.seza_prepare_new_store_trial();

CREATE OR REPLACE FUNCTION public.seza_attach_signup_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_store uuid; v_fp text;
BEGIN
  v_fp := NEW.raw_user_meta_data->>'business_fingerprint';
  IF v_fp IS NULL OR v_fp='' THEN RETURN NEW; END IF;
  SELECT store_id INTO v_store FROM public.profiles WHERE id=NEW.id;
  IF v_store IS NOT NULL THEN
    UPDATE public.stores SET business_fingerprint=v_fp, plan_status='inactive', trial_ends_at=NULL, plan_period_end=NULL,
      trial_eligibility='pending', business_verification_status='pending' WHERE id=v_store;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zzz_seza_attach_signup_identity ON auth.users;
CREATE TRIGGER zzz_seza_attach_signup_identity AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.seza_attach_signup_identity();


-- =============================================================================
-- FILE: supabase/migrations/20260730144025_b9c73a4e-70db-4da9-b918-dac07772dda2.sql
-- =============================================================================

REVOKE ALL ON FUNCTION public.activate_verified_business_trial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_verified_business_trial() FROM anon;
REVOKE ALL ON FUNCTION public.seza_attach_signup_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seza_attach_signup_identity() FROM anon;
REVOKE ALL ON FUNCTION public.seza_prepare_new_store_trial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seza_prepare_new_store_trial() FROM anon;

-- =============================================================================
-- FILE: supabase/migrations/20260802033000_role_realtime_storage_security_hardening.sql
-- =============================================================================

-- Security hardening for role checks, private customer-display broadcasts,
-- and tenant-scoped product image writes.

-- Role helpers must never treat a matching user id as proof of a role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles actor
        WHERE actor.user_id = auth.uid()
          AND actor.role IN ('owner'::public.app_role, 'admin'::public.app_role)
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = ANY(_roles)
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles actor
        WHERE actor.user_id = auth.uid()
          AND actor.role IN ('owner'::public.app_role, 'admin'::public.app_role)
      )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id AND p.store_id = _store_id
    UNION ALL
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.store_id = _store_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO authenticated, service_role;

-- Customer display topics are private and restricted to members of the store
-- encoded in customer-display:<store_uuid>.
DROP POLICY IF EXISTS "store users can receive customer display broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "store users can send customer display broadcasts" ON realtime.messages;

CREATE POLICY "store users can receive private customer display broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~ '^customer-display:[0-9a-fA-F-]{36}$'
  AND public.is_store_member(split_part((SELECT realtime.topic()), ':', 2)::uuid, auth.uid())
);

CREATE POLICY "store users can send private customer display broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~ '^customer-display:[0-9a-fA-F-]{36}$'
  AND public.is_store_member(split_part((SELECT realtime.topic()), ':', 2)::uuid, auth.uid())
);

-- Product image object names now begin with the store id. Both USING and
-- WITH CHECK enforce the same tenant folder, preventing cross-store moves.
DROP POLICY IF EXISTS "product-images authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "product-images public read" ON storage.objects;
DROP POLICY IF EXISTS "product-images read same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images insert same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images update same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images delete same store" ON storage.objects;

CREATE POLICY "product-images read same store"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "product-images insert same store"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);

CREATE POLICY "product-images update same store"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles owner_profile
    WHERE owner_profile.id = storage.objects.owner
      AND owner_profile.store_id = ((storage.foldername(name))[1])::uuid
  )
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);

CREATE POLICY "product-images delete same store"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);


-- =============================================================================
-- FILE: supabase/migrations/20260803023722_c4813cf9-80fa-497f-a603-de3960d83a46.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The role membership check is always evaluated; the second clause only limits
  -- WHO may ask about another user's roles. Being the subject never grants a role.
  SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = ANY(_roles)
        AND store_id = public.current_store_id()
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('owner'::app_role, 'admin'::app_role)
          AND store_id = public.current_store_id()
      )
    );
$function$;

DROP POLICY IF EXISTS "product-images update same store" ON storage.objects;
CREATE POLICY "product-images update same store"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  AND public.current_store_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_store_id()::text
)
WITH CHECK (
  bucket_id = 'product-images'
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  AND owner = auth.uid()
  AND public.current_store_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_store_id()::text
);

-- =============================================================================
-- FILE: supabase/migrations/20260803023938_7e7b94c5-22f0-4720-96a9-84d1f145f3e6.sql
-- =============================================================================

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip enable rls: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "customer_display_read_own_store" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "customer_display_write_own_store" ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY "customer_display_read_own_store"
      ON realtime.messages FOR SELECT TO authenticated
      USING (
        realtime.topic() = 'customer-display:' || public.current_store_id()::text
      )$p$;
    EXECUTE $p$
      CREATE POLICY "customer_display_write_own_store"
      ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (
        realtime.topic() = 'customer-display:' || public.current_store_id()::text
      )$p$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip realtime policies: %', SQLERRM;
  END;
END $$;

-- =============================================================================
-- FILE: supabase/migrations/20260823_own_supabase_full_schema.sql
-- =============================================================================

-- SEZA POS — consolidated STRUCTURE-ONLY schema for a fresh Supabase project.
-- Generated from the live database. Contains NO production rows, NO auth users,
-- NO secrets, NO storage objects, and NO hardcoded old project URLs.
-- Apply against an empty project, in a single transaction-less run (some
-- statements such as CREATE EXTENSION / pgmq.create cannot share a transaction).

-- SECTION: EXTENSIONS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm    WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- SECTION: ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'cashier', 'admin', 'super_admin', 'operations_admin', 'support_admin', 'billing_admin', 'analyst');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'tap', 'apple_pay', 'google_pay', 'gift_card', 'split', 'store_credit');

-- SECTION: SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS public.support_tickets_ticket_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1;

-- SECTION: TABLES
CREATE TABLE public.admin_login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  success boolean NOT NULL,
  ip text,
  user_agent text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_permissions (
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_support_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  admin_email text,
  store_id uuid,
  reason text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:30:00'::interval),
  status text NOT NULL DEFAULT 'pending'::text,
  decided_at timestamp with time zone,
  decided_by uuid,
  decision_note text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  client_capability text,
  client_metadata jsonb,
  channel_token uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE TABLE public.age_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  cashier_id uuid,
  cashier_email text,
  sale_id uuid,
  product_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  min_age smallint NOT NULL,
  method text NOT NULL,
  result text NOT NULL,
  customer_dob date,
  id_expires_on date,
  id_document_last4 text,
  id_full_name_masked text,
  manager_override_id uuid,
  override_reason text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.api_rate_limit_buckets (
  key_hash text NOT NULL,
  scope text NOT NULL,
  window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  blocked_until timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  store_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.business_trial_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_fingerprint text NOT NULL,
  normalized_business_name text NOT NULL,
  status text NOT NULL DEFAULT 'reserved'::text,
  first_user_id uuid,
  first_store_id uuid,
  trial_started_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  register_session_id uuid NOT NULL,
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  idempotency_key text
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  name text NOT NULL,
  color text DEFAULT '#2563eb'::text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.country_profiles (
  country_code text NOT NULL,
  country_name text NOT NULL,
  default_language text NOT NULL DEFAULT 'en'::text,
  default_locale text NOT NULL DEFAULT 'en-US'::text,
  currency_code text NOT NULL,
  currency_symbol text NOT NULL,
  symbol_position text NOT NULL DEFAULT 'before'::text,
  decimal_precision integer NOT NULL DEFAULT 2,
  thousands_sep text NOT NULL DEFAULT ','::text,
  decimal_sep text NOT NULL DEFAULT '.'::text,
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY'::text,
  time_format text NOT NULL DEFAULT 'h:mm A'::text,
  address_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_format text,
  postal_regex text,
  paper_size text NOT NULL DEFAULT 'letter'::text,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  tax_inclusive_default boolean NOT NULL DEFAULT false,
  receipt_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_reg_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rtl boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.device_pairing_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  store_id uuid NOT NULL,
  label text NOT NULL,
  created_by uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_device_id uuid,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.device_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  label text NOT NULL,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  platform text,
  paired_by uuid,
  paired_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text,
  last_sync_at timestamp with time zone
);

CREATE TABLE public.email_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.email_send_state (
  id integer NOT NULL DEFAULT 1,
  retry_after_until timestamp with time zone,
  batch_size integer NOT NULL DEFAULT 10,
  send_delay_ms integer NOT NULL DEFAULT 200,
  auth_email_ttl_minutes integer NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes integer NOT NULL DEFAULT 60,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.email_unsubscribe_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  used_at timestamp with time zone
);

CREATE TABLE public.legal_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'setup_wizard'::text
);

CREATE TABLE public.passkey_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  challenge text NOT NULL,
  user_id uuid,
  email_hash text,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.passkey_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}'::text[],
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Passkey'::text,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  attempted_by uuid,
  provider text,
  method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD'::text,
  status text NOT NULL,
  message text,
  reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_terminals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'manual'::text,
  serial text,
  location text,
  status text NOT NULL DEFAULT 'inactive'::text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_settings (
  id text NOT NULL DEFAULT 'global'::text,
  company_name text NOT NULL DEFAULT 'SEZA POS'::text,
  support_email text NOT NULL DEFAULT 'support@sezapos.com'::text,
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com'::text,
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com'::text,
  timezone text NOT NULL DEFAULT 'America/New_York'::text,
  default_trial_days integer NOT NULL DEFAULT 14,
  support_sla_minutes integer NOT NULL DEFAULT 60,
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  category_id uuid,
  sku text,
  barcode text,
  name text NOT NULL,
  description text,
  brand text,
  supplier text,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  stock numeric(12,3) NOT NULL DEFAULT 0,
  min_stock numeric(12,3) NOT NULL DEFAULT 0,
  max_stock numeric(12,3),
  unit text NOT NULL DEFAULT 'each'::text,
  track_inventory boolean NOT NULL DEFAULT true,
  is_favorite boolean NOT NULL DEFAULT false,
  image_url text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  images text[] NOT NULL DEFAULT '{}'::text[],
  age_restricted boolean NOT NULL DEFAULT false,
  min_age smallint,
  age_category text
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  email text,
  avatar_url text,
  store_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text,
  last_name text,
  phone text,
  employee_id text,
  status text NOT NULL DEFAULT 'active'::text,
  must_change_password boolean NOT NULL DEFAULT false,
  pin_hash text,
  photo_url text,
  hire_date date,
  hourly_wage numeric(10,2),
  scheduled_start_time text,
  scheduled_end_time text,
  late_threshold_minutes integer NOT NULL DEFAULT 5,
  must_change_pin boolean NOT NULL DEFAULT false,
  preferred_language text,
  preferred_locale text,
  pin_fingerprint text
);

CREATE TABLE public.refund_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL,
  sale_item_id uuid,
  product_id uuid,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  restock boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.refunds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  store_id uuid,
  cashier_id uuid,
  approver_id uuid,
  refund_type text NOT NULL DEFAULT 'partial'::text,
  reason text NOT NULL DEFAULT 'other'::text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'cash'::payment_method,
  status text NOT NULL DEFAULT 'completed'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.register_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  closed_by uuid,
  terminal_id uuid,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  expected_cash numeric,
  cash_sales numeric NOT NULL DEFAULT 0,
  cash_refunds numeric NOT NULL DEFAULT 0,
  variance numeric,
  status text NOT NULL DEFAULT 'open'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  safe_drop_amount numeric NOT NULL DEFAULT 0,
  approver_id uuid,
  close_notes text,
  denominations jsonb
);

CREATE TABLE public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  store_id uuid NOT NULL
);

CREATE TABLE public.sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  store_id uuid NOT NULL,
  method text NOT NULL,
  amount numeric NOT NULL,
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'completed'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  cashier_id uuid,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'cash'::payment_method,
  amount_tendered numeric(12,2),
  change_due numeric(12,2),
  status text NOT NULL DEFAULT 'completed'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  receipt_number bigint,
  refunded_amount numeric NOT NULL DEFAULT 0,
  refund_status text NOT NULL DEFAULT 'none'::text,
  customer_name text,
  terminal_ref text,
  register_session_id uuid,
  customer_phone text,
  customer_email text,
  idempotency_key text,
  synced_from_offline boolean NOT NULL DEFAULT false,
  offline_created_at timestamp with time zone,
  customer_id uuid,
  order_type text NOT NULL DEFAULT 'retail'::text,
  table_label text,
  guest_count integer,
  kitchen_status text NOT NULL DEFAULT 'not_required'::text,
  external_order_ref text
);

CREATE TABLE public.signup_risk_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  store_id uuid,
  event_type text NOT NULL,
  ip_hash text NOT NULL,
  email_hash text,
  business_fingerprint text,
  user_agent_hash text,
  country_code text,
  risk_score integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  sale_id uuid,
  sent_by uuid,
  provider text NOT NULL,
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  message_body text,
  idempotency_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_settings (
  store_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'twilio'::text,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  sender_id text,
  default_country text NOT NULL DEFAULT 'US'::text,
  enabled boolean NOT NULL DEFAULT false,
  last_status text,
  last_checked_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.stores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  tax_rate numeric(5,4) NOT NULL DEFAULT 0.0825,
  currency text NOT NULL DEFAULT 'USD'::text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  receipt_header text,
  receipt_footer text DEFAULT 'Thank you for your business!'::text,
  return_policy text DEFAULT 'Returns accepted within 14 days with receipt.'::text,
  email text,
  business_type text,
  city text,
  state text,
  zip text,
  country text DEFAULT 'US'::text,
  website text,
  tax_id text,
  language text DEFAULT 'en'::text,
  time_zone text DEFAULT 'America/New_York'::text,
  date_format text DEFAULT 'MM/DD/YYYY'::text,
  business_hours jsonb DEFAULT '{}'::jsonb,
  setup_completed_at timestamp with time zone,
  setup_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency_symbol text,
  tax_inclusive boolean NOT NULL DEFAULT false,
  receipt_logo_url text,
  thank_you_message text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_verification_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  country_code text,
  region_code text,
  locale text,
  paper_size text,
  address_format_override jsonb,
  phone_format_override text,
  plan_tier text NOT NULL DEFAULT 'trial_pro'::text,
  trial_ends_at timestamp with time zone,
  plan_status text NOT NULL DEFAULT 'trialing'::text,
  plan_period_end timestamp with time zone,
  plan_cancel_at_period_end boolean DEFAULT false,
  store_code text,
  starting_cash_float numeric NOT NULL DEFAULT 100,
  show_expected_before_count boolean NOT NULL DEFAULT false,
  variance_alert_threshold numeric NOT NULL DEFAULT 5,
  suspended_at timestamp with time zone,
  suspended_reason text,
  admin_notes text,
  allow_cashier_quick_add boolean NOT NULL DEFAULT false,
  pos_display_name text,
  business_fingerprint text,
  business_verification_status text NOT NULL DEFAULT 'pending'::text,
  trial_eligibility text NOT NULL DEFAULT 'pending'::text
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stripe_subscription_id text,
  stripe_customer_id text
);

CREATE TABLE public.support_ticket_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  author_id uuid,
  author_email text,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_number bigint NOT NULL DEFAULT nextval('support_tickets_ticket_number_seq'::regclass),
  store_id uuid,
  requester_id uuid,
  requester_email text,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general'::text,
  priority text NOT NULL DEFAULT 'normal'::text,
  status text NOT NULL DEFAULT 'open'::text,
  assigned_admin_id uuid,
  resolution text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  closed_at timestamp with time zone,
  claimed_at timestamp with time zone,
  chat_status text NOT NULL DEFAULT 'waiting'::text,
  chat_ended_at timestamp with time zone,
  chat_ended_by uuid,
  last_message_at timestamp with time zone,
  first_response_at timestamp with time zone,
  last_admin_read_at timestamp with time zone,
  last_merchant_read_at timestamp with time zone,
  resolution_summary text,
  resolution_code text
);

CREATE TABLE public.suppressed_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid,
  clock_in timestamp with time zone NOT NULL DEFAULT now(),
  clock_out timestamp with time zone,
  break_start timestamp with time zone,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  late boolean NOT NULL DEFAULT false,
  late_minutes integer NOT NULL DEFAULT 0,
  approved_by uuid,
  override_reason text
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  store_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- SECTION: CONSTRAINTS (primary keys, unique, check)
ALTER TABLE public.admin_login_attempts ADD CONSTRAINT admin_login_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_permissions ADD CONSTRAINT admin_permissions_pkey PRIMARY KEY (role, permission);
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_pkey PRIMARY KEY (id);
ALTER TABLE public.api_rate_limit_buckets ADD CONSTRAINT api_rate_limit_buckets_pkey PRIMARY KEY (key_hash);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_pkey PRIMARY KEY (id);
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.country_profiles ADD CONSTRAINT country_profiles_pkey PRIMARY KEY (country_code);
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);
ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_pkey PRIMARY KEY (id);
ALTER TABLE public.passkey_challenges ADD CONSTRAINT passkey_challenges_pkey PRIMARY KEY (id);
ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_terminals ADD CONSTRAINT payment_terminals_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_pkey PRIMARY KEY (id);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id);
ALTER TABLE public.signup_risk_events ADD CONSTRAINT signup_risk_events_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_pkey PRIMARY KEY (store_id);
ALTER TABLE public.stores ADD CONSTRAINT stores_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.support_ticket_notes ADD CONSTRAINT support_ticket_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_business_fingerprint_key UNIQUE (business_fingerprint);
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_code_hash_key UNIQUE (code_hash);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_policy_version_unique UNIQUE (user_id, store_id, terms_version, privacy_version);
ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_credential_id_key UNIQUE (credential_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_employee_id_key UNIQUE (employee_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_store_role_permission_key UNIQUE (store_id, role, permission);
ALTER TABLE public.stores ADD CONSTRAINT stores_store_code_key UNIQUE (store_code);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_store_id_key UNIQUE (user_id, role, store_id);
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_client_capability_check CHECK (((client_capability IS NULL) OR (client_capability = ANY (ARRAY['web_screen_share'::text, 'android_diagnostics_only'::text, 'android_screen_share'::text]))));
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'ended'::text, 'expired'::text])));
ALTER TABLE public.api_rate_limit_buckets ADD CONSTRAINT api_rate_limit_buckets_request_count_check CHECK ((request_count >= 0));
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'trial_active'::text, 'trial_used'::text, 'paid'::text, 'blocked'::text, 'review'::text])));
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_type_check CHECK ((type = ANY (ARRAY['payout'::text, 'deposit'::text, 'safe_drop'::text])));
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])));
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])));
ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_id_check CHECK ((id = 1));
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_privacy_version_check CHECK ((btrim(privacy_version) <> ''::text));
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_source_check CHECK ((source = ANY (ARRAY['signup'::text, 'setup_wizard'::text, 'policy_update'::text])));
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_terms_version_check CHECK ((btrim(terms_version) <> ''::text));
ALTER TABLE public.passkey_challenges ADD CONSTRAINT passkey_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['registration'::text, 'authentication'::text])));
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_default_trial_days_check CHECK (((default_trial_days >= 1) AND (default_trial_days <= 90)));
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_support_sla_minutes_check CHECK (((support_sla_minutes >= 5) AND (support_sla_minutes <= 10080)));
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_amount_check CHECK ((amount >= (0)::numeric));
ALTER TABLE public.stores ADD CONSTRAINT stores_business_verification_status_check CHECK ((business_verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'review'::text, 'rejected'::text])));
ALTER TABLE public.stores ADD CONSTRAINT stores_trial_eligibility_check CHECK ((trial_eligibility = ANY (ARRAY['pending'::text, 'eligible'::text, 'used'::text, 'blocked'::text, 'review'::text])));
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_chat_status_check CHECK ((chat_status = ANY (ARRAY['waiting'::text, 'active'::text, 'ended'::text])));
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])));

-- SECTION: FOREIGN KEYS
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_manager_override_id_fkey FOREIGN KEY (manager_override_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_first_store_id_fkey FOREIGN KEY (first_store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_first_user_id_fkey FOREIGN KEY (first_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_register_session_id_fkey FOREIGN KEY (register_session_id) REFERENCES register_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.categories ADD CONSTRAINT categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD CONSTRAINT customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_consumed_device_id_fkey FOREIGN KEY (consumed_device_id) REFERENCES device_registrations(id) ON DELETE SET NULL;
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_paired_by_fkey FOREIGN KEY (paired_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.passkey_challenges ADD CONSTRAINT passkey_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_attempted_by_fkey FOREIGN KEY (attempted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.payment_terminals ADD CONSTRAINT payment_terminals_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE;
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE SET NULL;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES auth.users(id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD CONSTRAINT sales_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_register_session_id_fkey FOREIGN KEY (register_session_id) REFERENCES register_sessions(id);
ALTER TABLE public.sales ADD CONSTRAINT sales_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.signup_risk_events ADD CONSTRAINT signup_risk_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.signup_risk_events ADD CONSTRAINT signup_risk_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.stores ADD CONSTRAINT stores_country_code_fkey FOREIGN KEY (country_code) REFERENCES country_profiles(country_code);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.support_ticket_notes ADD CONSTRAINT support_ticket_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_ticket_notes ADD CONSTRAINT support_ticket_notes_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_assigned_admin_id_fkey FOREIGN KEY (assigned_admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_chat_ended_by_fkey FOREIGN KEY (chat_ended_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- SECTION: INDEXES
CREATE INDEX IF NOT EXISTS admin_support_sessions_admin_idx ON public.admin_support_sessions USING btree (admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_support_sessions_channel_token_idx ON public.admin_support_sessions USING btree (channel_token);
CREATE INDEX IF NOT EXISTS admin_support_sessions_store_idx ON public.admin_support_sessions USING btree (store_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_support_sessions_store_status_idx ON public.admin_support_sessions USING btree (store_id, status) WHERE (status = ANY (ARRAY['pending'::text, 'active'::text]));
CREATE INDEX IF NOT EXISTS age_verifications_store_created_idx ON public.age_verifications USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_scope_idx ON public.api_rate_limit_buckets USING btree (scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_updated_idx ON public.api_rate_limit_buckets USING btree (updated_at);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log USING btree (action);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log USING btree (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);
CREATE UNIQUE INDEX cash_movements_idempotency_key_uidx ON public.cash_movements USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON public.cash_movements USING btree (register_session_id);
CREATE INDEX IF NOT EXISTS cash_movements_store_idx ON public.cash_movements USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_store_email_idx ON public.customers USING btree (store_id, lower(email));
CREATE INDEX IF NOT EXISTS customers_store_id_idx ON public.customers USING btree (store_id);
CREATE INDEX IF NOT EXISTS customers_store_phone_idx ON public.customers USING btree (store_id, phone);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time ON public.admin_login_attempts USING btree (lower(email), attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_trial_registry_status ON public.business_trial_registry USING btree (status);
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_store ON public.device_pairing_codes USING btree (store_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_device_registrations_store ON public.device_registrations USING btree (store_id, status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log USING btree (message_id);
CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);
CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expiry ON public.passkey_challenges USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON public.passkey_credentials USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products USING btree (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products USING btree (sku);
CREATE INDEX IF NOT EXISTS idx_products_store ON public.products USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_created ON public.sales USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_risk_business ON public.signup_risk_events USING btree (business_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_risk_ip_time ON public.signup_risk_events USING btree (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stores_business_fingerprint ON public.stores USING btree (business_fingerprint);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON public.subscriptions USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions USING btree (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions USING btree (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);
CREATE INDEX IF NOT EXISTS legal_acceptances_store_recorded_idx ON public.legal_acceptances USING btree (store_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS payment_attempts_created_at_idx ON public.payment_attempts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS role_permissions_store_idx ON public.role_permissions USING btree (store_id);
CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx ON public.sale_payments USING btree (sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_store_id_idx ON public.sale_payments USING btree (store_id);
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON public.sales USING btree (customer_id);
CREATE INDEX IF NOT EXISTS sales_external_order_ref_idx ON public.sales USING btree (external_order_ref);
CREATE UNIQUE INDEX sales_idempotency_key_uidx ON public.sales USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX sales_receipt_number_key ON public.sales USING btree (receipt_number);
CREATE INDEX IF NOT EXISTS sales_register_session_id_idx ON public.sales USING btree (register_session_id);
CREATE UNIQUE INDEX sms_send_log_idem_idx ON public.sms_send_log USING btree (store_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS sms_send_log_store_created_idx ON public.sms_send_log USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket_idx ON public.support_ticket_notes USING btree (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_tickets_chat_activity_idx ON public.support_tickets USING btree (chat_status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON public.support_tickets USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets USING btree (status);
CREATE INDEX IF NOT EXISTS support_tickets_store_idx ON public.support_tickets USING btree (store_id);
CREATE UNIQUE INDEX time_entries_one_open_per_user ON public.time_entries USING btree (user_id) WHERE (clock_out IS NULL);
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON public.time_entries USING btree (user_id, clock_in DESC);
CREATE UNIQUE INDEX uq_profiles_store_pin_fingerprint ON public.profiles USING btree (store_id, pin_fingerprint) WHERE ((status = 'active'::text) AND (pin_fingerprint IS NOT NULL));

-- SECTION: TRIGGERS
CREATE TRIGGER seza_write_limit_cash_movements BEFORE INSERT OR DELETE OR UPDATE ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('120', '3600', '600');
CREATE TRIGGER seza_write_limit_categories BEFORE INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('300', '3600', '300');
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_customers BEFORE INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('600', '3600', '300');
CREATE TRIGGER device_registrations_protect_secret BEFORE INSERT OR UPDATE ON public.device_registrations FOR EACH ROW EXECUTE FUNCTION tg_device_registrations_protect_secret();
CREATE TRIGGER device_registrations_updated_at BEFORE UPDATE ON public.device_registrations FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_legal_acceptances BEFORE INSERT OR DELETE OR UPDATE ON public.legal_acceptances FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('20', '3600', '3600');
CREATE TRIGGER payment_terminals_updated_at BEFORE UPDATE ON public.payment_terminals FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_products BEFORE INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('2000', '3600', '300');
CREATE TRIGGER profiles_prevent_privileged_self_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_profiles_prevent_privileged_self_update();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER refund_items_restock AFTER INSERT ON public.refund_items FOR EACH ROW EXECUTE FUNCTION tg_restock_on_refund();
CREATE TRIGGER refunds_update_sale AFTER INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION tg_update_sale_refund_totals();
CREATE TRIGGER seza_write_limit_refunds BEFORE INSERT OR DELETE OR UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('60', '3600', '1800');
CREATE TRIGGER register_sessions_updated_at BEFORE UPDATE ON public.register_sessions FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER sale_items_decrement_stock AFTER INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION tg_decrement_stock_on_sale();
CREATE TRIGGER sale_payments_set_updated_at BEFORE UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER sales_assign_receipt BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION tg_assign_receipt_number();
CREATE TRIGGER sms_settings_set_updated_at BEFORE UPDATE ON public.sms_settings FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_prepare_new_store_trial_trigger BEFORE INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION seza_prepare_new_store_trial();
CREATE TRIGGER stores_prevent_platform_field_writes BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION tg_stores_prevent_platform_field_writes();
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER trg_subscription_recompute AFTER INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION tg_subscription_recompute();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_support_ticket_notes BEFORE INSERT OR DELETE OR UPDATE ON public.support_ticket_notes FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('120', '3600', '600');
CREATE TRIGGER seza_write_limit_support_tickets BEFORE INSERT OR DELETE OR UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('5', '3600', '3600');
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER tg_support_tickets_assign_number BEFORE INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION tg_assign_ticket_number();
CREATE TRIGGER seza_write_limit_time_entries BEFORE INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('240', '3600', '600');
CREATE TRIGGER time_entries_prevent_privileged_self_update BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION tg_time_entries_prevent_privileged_self_update();
CREATE TRIGGER trg_time_entries_compute_late BEFORE INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION tg_time_entries_compute_late();
CREATE TRIGGER trg_enforce_role_exclusivity BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_enforce_role_exclusivity();
CREATE TRIGGER trg_protect_super_admin BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_protect_super_admin_role();
CREATE TRIGGER user_roles_protect_last_owner BEFORE DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_user_roles_protect_last_owner();

-- SECTION: FUNCTIONS PART 1
CREATE OR REPLACE FUNCTION public.activate_verified_business_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id uuid;
  v_fp text;
  v_days integer := 14;
  v_registry public.business_trial_registry%ROWTYPE;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.store_id INTO v_store_id FROM public.profiles p WHERE p.id = NEW.id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.business_fingerprint INTO v_fp FROM public.stores s WHERE s.id = v_store_id;
  IF v_fp IS NULL OR v_fp = '' THEN
    UPDATE public.stores SET trial_eligibility='review', plan_status='inactive', trial_ends_at=NULL WHERE id=v_store_id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(default_trial_days,14) INTO v_days FROM public.platform_settings WHERE id='global';
  INSERT INTO public.business_trial_registry (business_fingerprint, normalized_business_name, first_user_id, first_store_id)
  VALUES (v_fp, lower(trim(COALESCE(NEW.raw_user_meta_data->>'business_name','business'))), NEW.id, v_store_id)
  ON CONFLICT (business_fingerprint) DO NOTHING;

  SELECT * INTO v_registry FROM public.business_trial_registry WHERE business_fingerprint=v_fp FOR UPDATE;
  IF v_registry.status IN ('trial_used','trial_active','paid','blocked')
     AND v_registry.first_user_id IS DISTINCT FROM NEW.id THEN
    UPDATE public.stores SET trial_eligibility='used', plan_status='inactive', trial_ends_at=NULL, plan_period_end=NULL WHERE id=v_store_id;
    RETURN NEW;
  END IF;

  UPDATE public.business_trial_registry
     SET status='trial_active', first_user_id=COALESCE(first_user_id,NEW.id), first_store_id=COALESCE(first_store_id,v_store_id),
         trial_started_at=COALESCE(trial_started_at,now()), trial_ends_at=COALESCE(trial_ends_at,now()+make_interval(days=>v_days)), updated_at=now()
   WHERE business_fingerprint=v_fp;

  UPDATE public.stores
     SET business_verification_status='verified', trial_eligibility='eligible', plan_tier='trial_pro', plan_status='trialing',
         trial_ends_at=COALESCE(trial_ends_at,now()+make_interval(days=>v_days)),
         plan_period_end=COALESCE(plan_period_end,now()+make_interval(days=>v_days))
   WHERE id=v_store_id;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.admin_global_search(_q text, _limit integer DEFAULT 25)
 RETURNS TABLE(kind text, id uuid, store_id uuid, label text, sublabel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q text := lower(coalesce(_q, ''));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'store'::text, s.id, s.id,
           s.name,
           coalesce(s.email, s.store_code, s.city, '')::text
    FROM public.stores s
    WHERE lower(s.name) LIKE '%'||q||'%'
       OR lower(coalesce(s.store_code,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.phone,'')) LIKE '%'||q||'%'
       OR s.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'owner'::text, p.id, p.store_id,
           coalesce(p.full_name, p.email, '(no name)')::text,
           coalesce(p.email, p.phone, '')::text
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('owner'::app_role, 'admin'::app_role)
    WHERE lower(coalesce(p.full_name,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.phone,'')) LIKE '%'||q||'%'
       OR p.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'terminal'::text, t.id, t.store_id,
           t.label,
           coalesce(t.serial, t.provider, '')::text
    FROM public.payment_terminals t
    WHERE lower(t.label) LIKE '%'||q||'%'
       OR lower(coalesce(t.serial,'')) LIKE '%'||q||'%'
       OR t.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'subscription'::text, sub.id, sub.store_id,
           coalesce(sub.stripe_subscription_id, sub.id::text),
           coalesce(sub.status, '')::text
    FROM public.subscriptions sub
    WHERE lower(coalesce(sub.stripe_subscription_id,'')) LIKE '%'||q||'%'
       OR lower(coalesce(sub.stripe_customer_id,'')) LIKE '%'||q||'%'
       OR sub.id::text = q
    LIMIT _limit;
END $function$
;

CREATE OR REPLACE FUNCTION public.can_manage_employee(_actor uuid, _target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_store uuid;
  v_target_store uuid;
  v_actor_roles text[];
  v_target_roles text[];
BEGIN
  IF _actor IS NULL OR _target IS NULL THEN RETURN false; END IF;

  SELECT store_id INTO v_actor_store  FROM public.profiles WHERE id = _actor;
  SELECT store_id INTO v_target_store FROM public.profiles WHERE id = _target;
  IF v_actor_store IS NULL OR v_target_store IS NULL
     OR v_actor_store <> v_target_store THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_actor_roles FROM public.user_roles
    WHERE user_id = _actor AND store_id = v_actor_store;
  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_target_roles FROM public.user_roles
    WHERE user_id = _target AND store_id = v_target_store;

  -- Never allow anyone to manage a platform-staff account through this path.
  IF v_target_roles && ARRAY[
    'super_admin','operations_admin','support_admin','billing_admin','analyst',
    'technical_support','merchant_support','compliance_support','billing_support',
    'read_only_auditor'
  ] THEN
    RETURN false;
  END IF;

  IF 'owner' = ANY(v_actor_roles) THEN
    -- Owner may manage anyone but must not act on themselves for
    -- role/removal (checked at call site via is_last_owner).
    RETURN true;
  END IF;

  IF 'admin' = ANY(v_actor_roles) THEN
    -- Admin may manage admin/manager/cashier, not owner.
    RETURN NOT ('owner' = ANY(v_target_roles));
  END IF;

  IF 'manager' = ANY(v_actor_roles) THEN
    -- Manager may only touch cashiers (never themselves, another manager,
    -- an admin, or an owner).
    IF _actor = _target THEN RETURN false; END IF;
    RETURN NOT (
      'owner'   = ANY(v_target_roles)
      OR 'admin'   = ANY(v_target_roles)
      OR 'manager' = ANY(v_target_roles)
    );
  END IF;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limit_buckets()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.api_rate_limit_buckets
  WHERE updated_at < now() - interval '7 days'
    AND (blocked_until IS NULL OR blocked_until < now() - interval '1 day');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(p_key_hash text, p_scope text, p_limit integer, p_window_seconds integer, p_block_seconds integer DEFAULT 0)
 RETURNS TABLE(allowed boolean, remaining integer, retry_after_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket public.api_rate_limit_buckets%ROWTYPE;
  v_window interval;
  v_block interval;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 OR length(p_key_hash) > 128 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_scope IS NULL OR length(btrim(p_scope)) = 0 OR length(p_scope) > 120 THEN
    RAISE EXCEPTION 'Invalid rate-limit scope';
  END IF;
  IF p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid rate-limit maximum';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  IF p_block_seconds < 0 OR p_block_seconds > 604800 THEN
    RAISE EXCEPTION 'Invalid rate-limit block duration';
  END IF;

  v_window := make_interval(secs => p_window_seconds);
  v_block := make_interval(secs => p_block_seconds);

  INSERT INTO public.api_rate_limit_buckets (
    key_hash, scope, window_started_at, request_count, blocked_until, updated_at
  ) VALUES (
    p_key_hash, p_scope, v_now, 0, NULL, v_now
  )
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_bucket
  FROM public.api_rate_limit_buckets
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF v_bucket.blocked_until IS NOT NULL AND v_bucket.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0,
      GREATEST(1, ceil(extract(epoch FROM (v_bucket.blocked_until - v_now)))::integer);
    RETURN;
  END IF;

  IF v_bucket.window_started_at + v_window <= v_now THEN
    UPDATE public.api_rate_limit_buckets
    SET scope = p_scope,
        window_started_at = v_now,
        request_count = 1,
        blocked_until = NULL,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT true, GREATEST(0, p_limit - 1), 0;
    RETURN;
  END IF;

  IF v_bucket.request_count >= p_limit THEN
    UPDATE public.api_rate_limit_buckets
    SET blocked_until = CASE
          WHEN p_block_seconds > 0 THEN v_now + v_block
          ELSE v_bucket.window_started_at + v_window
        END,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT false, 0,
      GREATEST(
        1,
        ceil(extract(epoch FROM (
          CASE WHEN p_block_seconds > 0 THEN v_now + v_block
               ELSE v_bucket.window_started_at + v_window END
          - v_now
        )))::integer
      );
    RETURN;
  END IF;

  UPDATE public.api_rate_limit_buckets
  SET scope = p_scope,
      request_count = request_count + 1,
      blocked_until = NULL,
      updated_at = v_now
  WHERE key_hash = p_key_hash
  RETURNING * INTO v_bucket;

  RETURN QUERY SELECT true, GREATEST(0, p_limit - v_bucket.request_count), 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_store_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT store_id FROM public.profiles WHERE id = auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_for_employee_id(p_employee_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT email
    FROM public.profiles
   WHERE employee_id = p_employee_id
     AND status = 'active'
   LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'TODO_APP_ORIGIN/api/email/queue/process', -- TODO: set to your own deployment origin
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'SEZA-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'TODO_APP_ORIGIN/api/email/queue/process', -- TODO: set to your own deployment origin
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'SEZA-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_authenticated_write_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_limit integer := TG_ARGV[0]::integer;
  v_window integer := TG_ARGV[1]::integer;
  v_block integer := TG_ARGV[2]::integer;
  v_key text;
  v_allowed boolean;
  v_remaining integer;
  v_retry integer;
BEGIN
  -- Service-role/internal work has no auth.uid() and is already protected by
  -- the server endpoint that invoked it.
  IF v_actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_key := encode(
    digest(v_actor::text || ':' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || TG_OP, 'sha256'),
    'hex'
  );

  SELECT allowed, remaining, retry_after_seconds
    INTO v_allowed, v_remaining, v_retry
  FROM public.consume_api_rate_limit(
    v_key,
    'db.write.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    v_limit,
    v_window,
    v_block
  );

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'RATE_LIMITED',
      DETAIL = 'retry_after_seconds=' || GREATEST(1, COALESCE(v_retry, 1));
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_sale_id uuid;
  v_idempotency_key text;
  v_sale public.sales%ROWTYPE;
  v_created boolean := false;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_existing_items integer := 0;
  v_existing_payments integer := 0;
  v_items_total numeric := 0;
  v_payments_total numeric := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'p_sale must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A sale must contain at least one item' USING ERRCODE = '23514';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'p_payments must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_store_id := NULLIF(p_sale->>'store_id', '')::uuid;
  IF v_store_id IS NULL OR v_store_id IS DISTINCT FROM public.current_store_id() THEN
    RAISE EXCEPTION 'Sale store does not match the authenticated user store' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_user_id, 'sales.create') THEN
    RAISE EXCEPTION 'User does not have sales.create permission' USING ERRCODE = '42501';
  END IF;

  v_sale_id := COALESCE(NULLIF(p_sale->>'id', '')::uuid, gen_random_uuid());
  v_idempotency_key := NULLIF(btrim(p_sale->>'idempotency_key'), '');
  v_subtotal := COALESCE((p_sale->>'subtotal')::numeric, 0);
  v_tax := COALESCE((p_sale->>'tax')::numeric, 0);
  v_discount := COALESCE((p_sale->>'discount')::numeric, 0);
  v_total := COALESCE((p_sale->>'total')::numeric, 0);

  IF v_subtotal < 0 OR v_tax < 0 OR v_discount < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'Sale monetary values cannot be negative' USING ERRCODE = '23514';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Sale discount cannot exceed subtotal' USING ERRCODE = '23514';
  END IF;
  IF abs(v_total - (v_subtotal - v_discount + v_tax)) > 0.01 THEN
    RAISE EXCEPTION 'Sale total does not match subtotal, discount, and tax' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(p_sale->>'register_session_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.register_sessions
    WHERE id = (p_sale->>'register_session_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Register session does not belong to this store' USING ERRCODE = '23503';
  END IF;
  IF NULLIF(p_sale->>'customer_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = (p_sale->>'customer_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this store' USING ERRCODE = '23503';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Sale item quantity must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE((v_item->>'unit_price')::numeric, -1) < 0
       OR COALESCE((v_item->>'line_total')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Sale item prices cannot be negative' USING ERRCODE = '23514';
    END IF;
    IF abs(
      (v_item->>'line_total')::numeric
      - ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric)
    ) > 0.01 THEN
      RAISE EXCEPTION 'Sale item line total is invalid' USING ERRCODE = '23514';
    END IF;
    v_items_total := v_items_total + (v_item->>'line_total')::numeric;
    IF NULLIF(btrim(v_item->>'product_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Sale item product_name is required' USING ERRCODE = '23502';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'Product % does not belong to this store', v_product_id USING ERRCODE = '23503';
    END IF;
  END LOOP;

  IF abs(v_items_total - v_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'Sale items do not match subtotal' USING ERRCODE = '23514';
  END IF;

  PERFORM p.id
  FROM public.products p
  JOIN (
    SELECT
      NULLIF(item->>'product_id', '')::uuid AS product_id,
      sum((item->>'quantity')::numeric) AS quantity
    FROM jsonb_array_elements(p_items) AS rows(item)
    WHERE NULLIF(item->>'product_id', '') IS NOT NULL
    GROUP BY NULLIF(item->>'product_id', '')::uuid
  ) requested ON requested.product_id = p.id
  WHERE p.store_id = v_store_id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN (
      SELECT
        NULLIF(item->>'product_id', '')::uuid AS product_id,
        sum((item->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_items) AS rows(item)
      WHERE NULLIF(item->>'product_id', '') IS NOT NULL
      GROUP BY NULLIF(item->>'product_id', '')::uuid
    ) requested ON requested.product_id = p.id
    WHERE p.store_id = v_store_id
      AND p.track_inventory
      AND p.stock < requested.quantity
  ) THEN
    RAISE EXCEPTION 'Insufficient inventory for one or more products' USING ERRCODE = '23514';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF COALESCE((v_payment->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_payment->>'method', '') NOT IN ('cash','card','tap_to_pay','manual_card','gift_card','other') THEN
      RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '23514';
    END IF;
    v_payments_total := v_payments_total + (v_payment->>'amount')::numeric;
  END LOOP;
  IF v_total > 0 AND jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'A paid sale must include a payment allocation' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_payments) > 0 AND abs(v_payments_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Payment allocations do not match sale total' USING ERRCODE = '23514';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE idempotency_key = v_idempotency_key LIMIT 1;
  END IF;
  IF v_sale.id IS NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE id = v_sale_id LIMIT 1;
  END IF;

  IF v_sale.id IS NULL THEN
    BEGIN
      INSERT INTO public.sales (
        id, store_id, cashier_id, subtotal, tax, discount, total, payment_method,
        amount_tendered, change_due, terminal_ref, register_session_id, status,
        customer_name, idempotency_key, synced_from_offline, offline_created_at,
        customer_id, order_type, table_label, guest_count, kitchen_status, external_order_ref
      ) VALUES (
        v_sale_id, v_store_id, v_user_id, v_subtotal, v_tax, v_discount, v_total,
        COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash')::public.payment_method,
        NULLIF(p_sale->>'amount_tendered', '')::numeric,
        NULLIF(p_sale->>'change_due', '')::numeric,
        NULLIF(p_sale->>'terminal_ref', ''),
        NULLIF(p_sale->>'register_session_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'status', ''), 'completed'),
        NULLIF(p_sale->>'customer_name', ''),
        v_idempotency_key,
        COALESCE((p_sale->>'synced_from_offline')::boolean, false),
        NULLIF(p_sale->>'offline_created_at', '')::timestamptz,
        NULLIF(p_sale->>'customer_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'order_type', ''), 'retail'),
        NULLIF(p_sale->>'table_label', ''),
        NULLIF(p_sale->>'guest_count', '')::integer,
        COALESCE(NULLIF(p_sale->>'kitchen_status', ''), 'not_required'),
        NULLIF(p_sale->>'external_order_ref', '')
      )
      RETURNING * INTO v_sale;
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_sale
      FROM public.sales
      WHERE id = v_sale_id
         OR (v_idempotency_key IS NOT NULL AND idempotency_key = v_idempotency_key)
      ORDER BY (idempotency_key = v_idempotency_key) DESC NULLS LAST
      LIMIT 1;
      IF v_sale.id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF v_sale.store_id IS DISTINCT FROM v_store_id OR v_sale.cashier_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another sale context' USING ERRCODE = '42501';
  END IF;
  IF abs(v_sale.subtotal - v_subtotal) > 0.01
     OR abs(v_sale.tax - v_tax) > 0.01
     OR abs(v_sale.discount - v_discount) > 0.01
     OR abs(v_sale.total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Idempotency key payload does not match the original sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_items FROM public.sale_items WHERE sale_id = v_sale.id;
  IF v_existing_items = 0 THEN
    INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
    SELECT v_sale.id,
      NULLIF(item->>'product_id', '')::uuid,
      item->>'product_name',
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'line_total')::numeric
    FROM jsonb_array_elements(p_items) AS rows(item);
  ELSIF v_created THEN
    RAISE EXCEPTION 'Unexpected sale item state for newly created sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_payments FROM public.sale_payments WHERE sale_id = v_sale.id;
  IF v_existing_payments = 0 AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
    LOOP
      INSERT INTO public.sale_payments (sale_id, store_id, method, amount, provider, provider_reference, status, metadata)
      VALUES (
        v_sale.id, v_store_id,
        v_payment->>'method',
        (v_payment->>'amount')::numeric,
        NULLIF(v_payment->>'provider', ''),
        NULLIF(v_payment->>'provider_reference', ''),
        COALESCE(NULLIF(v_payment->>'status', ''), 'completed'),
        COALESCE(v_payment->'metadata', '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'receipt_number', v_sale.receipt_number,
    'created_at', v_sale.created_at,
    'store_id', v_sale.store_id,
    'already_existed', NOT v_created
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_employee_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id text;
BEGIN
  LOOP
    new_id := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id = new_id);
  END LOOP;
  RETURN new_id;
END
$function$
;

CREATE OR REPLACE FUNCTION public.generate_store_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  LOOP
    new_code := 'SZ-';
    FOR i IN 1..6 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stores WHERE store_code = new_code);
  END LOOP;
  RETURN new_code;
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id uuid;
  v_is_merchant boolean;
  v_business_name text;
  v_full_name text;
  v_phone text;
  v_country text;
  v_tz text;
  v_emp_id text;
  v_user_count int;
  v_is_platform boolean;
BEGIN
  -- Platform staff never get a merchant profile or merchant role auto-created.
  v_is_platform :=
    COALESCE(NEW.raw_user_meta_data->>'platform_staff', '') = 'true'
    OR public.is_platform_staff(NEW.id);

  IF v_is_platform THEN
    RETURN NEW;
  END IF;

  v_business_name := NEW.raw_user_meta_data->>'business_name';
  v_is_merchant := v_business_name IS NOT NULL AND length(trim(v_business_name)) > 0;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'US');
  v_tz := COALESCE(NULLIF(NEW.raw_user_meta_data->>'time_zone', ''), 'America/New_York');

  SELECT count(*) INTO v_user_count FROM public.profiles;

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.stores (
      name, phone, country, time_zone, email, store_code,
      trial_ends_at, plan_tier, plan_status, plan_period_end
    ) VALUES (
      COALESCE(v_business_name, 'My Store'),
      v_phone, v_country, v_tz, NEW.email,
      public.generate_store_code(),
      now() + interval '14 days',
      'trial_pro', 'trialing', now() + interval '14 days'
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  -- If no store exists (e.g. platform-only project state), do not force a merchant record.
  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id, v_full_name, NEW.email, v_store_id, v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END $function$
;

-- SECTION: FUNCTIONS PART 2
CREATE OR REPLACE FUNCTION public.has_active_plan(_store_id uuid, _min_tier text DEFAULT 'starter'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id
       AND plan_status IN ('active','trialing','past_due')
       AND public.tier_rank(plan_tier) >= public.tier_rank(_min_tier)
       AND (plan_period_end IS NULL OR plan_period_end > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- super_admin always wins
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.admin_permissions ap
        ON ap.role = ur.role::text
      WHERE ur.user_id = _user_id
        AND (ap.permission = _permission OR ap.permission = '*')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The role membership check is always evaluated; the second clause only limits
  -- WHO may ask about another user's roles. Being the subject never grants a role.
  SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = ANY(_roles)
        AND store_id = public.current_store_id()
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('owner'::app_role, 'admin'::app_role)
          AND store_id = public.current_store_id()
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND ur.store_id = public.current_store_id()
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('owner'::app_role, 'admin'::app_role)
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END
$function$
;

CREATE OR REPLACE FUNCTION public.is_last_owner(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'owner'::app_role
      AND (
        SELECT count(*)
        FROM public.user_roles ur2
        WHERE ur2.role = 'owner'::app_role
          AND ur2.store_id = ur.store_id
      ) <= 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'super_admin',
        'operations_admin',
        'support_admin',
        'billing_admin',
        'analyst',
        'technical_support',
        'merchant_support',
        'compliance_support'
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_read_only(_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id
       AND plan_status IN ('active','trialing','past_due')
       AND (plan_period_end IS NULL OR plan_period_end > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _subject text DEFAULT NULL::text)
 RETURNS support_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_active boolean;
  v_ticket public.support_tickets;
  v_is_priv boolean;
  v_is_requester boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT store_id, (status = 'active') INTO v_store, v_active
    FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_active, false) OR v_store IS NULL THEN
    RAISE EXCEPTION 'Inactive or unassigned employee' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND OR v_ticket.store_id IS DISTINCT FROM v_store THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = '42501';
  END IF;

  v_is_requester := (v_ticket.requester_id = v_uid);
  v_is_priv :=
    public.has_any_role(v_uid, ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    OR public.has_permission(v_uid, 'support.manage');

  IF NOT (v_is_requester OR v_is_priv) THEN
    RAISE EXCEPTION 'Not permitted to modify this ticket' USING ERRCODE = '42501';
  END IF;

  -- Cashiers (non-privileged requesters) may not reassign priority.
  IF _priority IS NOT NULL AND NOT v_is_priv THEN
    RAISE EXCEPTION 'Not permitted to change priority' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('open','waiting_support','waiting_for_merchant','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;

  IF _priority IS NOT NULL AND _priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority' USING ERRCODE = '22023';
  END IF;

  UPDATE public.support_tickets
     SET status     = COALESCE(_status, status),
         priority   = COALESCE(_priority, priority),
         subject    = COALESCE(NULLIF(btrim(_subject), ''), subject),
         updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_ticket;

  RETURN v_ticket;
END
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.plan_tier_for_price(_price_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _price_id
    WHEN 'business_monthly' THEN 'business'
    WHEN 'pro_monthly'      THEN 'pro'
    WHEN 'starter_monthly'  THEN 'starter'
    ELSE 'starter'
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_find_pin_candidates(_store_id uuid, _fingerprint text)
 RETURNS TABLE(id uuid, email text, pin_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.email, p.pin_hash
    FROM public.profiles p
   WHERE p.store_id = _store_id
     AND p.status = 'active'
     AND p.pin_fingerprint = _fingerprint
     AND p.pin_hash IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_list_unfingerprinted(_store_id uuid)
 RETURNS TABLE(id uuid, email text, pin_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.email, p.pin_hash
    FROM public.profiles p
   WHERE p.store_id = _store_id
     AND p.status = 'active'
     AND p.pin_hash IS NOT NULL
     AND p.pin_fingerprint IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE store_id = _store_id
      AND status = 'active'
      AND pin_fingerprint = _fingerprint
      AND (_exclude_user IS NULL OR id <> _exclude_user)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_store_plan(_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub RECORD;
  v_trial_ends timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT trial_ends_at INTO v_trial_ends FROM public.stores WHERE id = _store_id;

  SELECT s.* INTO v_sub
    FROM public.subscriptions s
   WHERE s.store_id = _store_id
     AND s.environment = CASE
       WHEN current_setting('app.environment', true) = 'live' THEN 'live'
       ELSE 'sandbox'
     END
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_sub IS NULL THEN
    SELECT s.* INTO v_sub
      FROM public.subscriptions s
     WHERE s.store_id = _store_id
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  IF v_sub.id IS NOT NULL AND (
        v_sub.status IN ('active','trialing','past_due')
        OR (v_sub.status = 'canceled' AND v_sub.current_period_end > v_now)
     ) THEN
    UPDATE public.stores SET
      plan_tier = public.plan_tier_for_price(v_sub.price_id),
      plan_status = v_sub.status,
      plan_period_end = v_sub.current_period_end,
      plan_cancel_at_period_end = COALESCE(v_sub.cancel_at_period_end, false)
    WHERE id = _store_id;
  ELSIF v_trial_ends IS NOT NULL AND v_trial_ends > v_now THEN
    UPDATE public.stores SET
      plan_tier = 'trial_pro',
      plan_status = 'trialing',
      plan_period_end = v_trial_ends,
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  ELSE
    UPDATE public.stores SET
      plan_tier = 'expired',
      plan_status = 'expired',
      plan_period_end = COALESCE(v_sub.current_period_end, v_trial_ends),
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone DEFAULT now(), p_source text DEFAULT 'setup_wizard'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
  IF v_accepted_at < now() - interval '24 hours' OR v_accepted_at > now() + interval '5 minutes' THEN
    v_accepted_at := now();
  END IF;

  INSERT INTO public.legal_acceptances (user_id, store_id, terms_version, privacy_version, accepted_at, source)
  VALUES (v_user_id, v_store_id, btrim(p_terms_version), btrim(p_privacy_version), v_accepted_at, p_source)
  ON CONFLICT (user_id, store_id, terms_version, privacy_version) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.legal_acceptances
     WHERE user_id = v_user_id
       AND store_id = v_store_id
       AND terms_version = btrim(p_terms_version)
       AND privacy_version = btrim(p_privacy_version);
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seza_attach_signup_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_fp text;
BEGIN
  v_fp := NEW.raw_user_meta_data->>'business_fingerprint';
  IF v_fp IS NULL OR v_fp='' THEN RETURN NEW; END IF;
  SELECT store_id INTO v_store FROM public.profiles WHERE id=NEW.id;
  IF v_store IS NOT NULL THEN
    UPDATE public.stores SET business_fingerprint=v_fp, plan_status='inactive', trial_ends_at=NULL, plan_period_end=NULL,
      trial_eligibility='pending', business_verification_status='pending' WHERE id=v_store;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.seza_prepare_new_store_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.business_fingerprint IS NOT NULL THEN
    NEW.plan_status := 'inactive';
    NEW.trial_ends_at := NULL;
    NEW.plan_period_end := NULL;
    NEW.trial_eligibility := 'pending';
    NEW.business_verification_status := 'pending';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.simulate_trial_expiry(_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.stores
     SET trial_ends_at = now() - interval '1 minute'
   WHERE id = _store_id;
  PERFORM public.recompute_store_plan(_store_id);
END $function$
;

-- SECTION: FUNCTIONS PART 3 (trigger functions)
CREATE OR REPLACE FUNCTION public.tg_assign_receipt_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := nextval('public.receipt_number_seq');
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_assign_ticket_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN IF NEW.ticket_number IS NULL THEN NEW.ticket_number := nextval('public.support_ticket_number_seq'); END IF; RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.tg_decrement_stock_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_device_registrations_protect_secret()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.tg_enforce_role_exclusivity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_new_platform boolean;
  v_has_merchant boolean;
  v_has_platform boolean;
BEGIN
  v_is_new_platform := NEW.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst');

  IF v_is_new_platform THEN
    -- Inserting a platform role: user must not already have any merchant role.
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role::text NOT IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
    ) INTO v_has_merchant;
    IF v_has_merchant THEN
      RAISE EXCEPTION 'User % already has a merchant role; platform-staff roles cannot be mixed with merchant roles.', NEW.user_id;
    END IF;
  ELSE
    -- Inserting a merchant role: user must not already have any platform role.
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
    ) INTO v_has_platform;
    IF v_has_platform THEN
      RAISE EXCEPTION 'User % is platform staff; merchant roles cannot be assigned to platform accounts.', NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_profiles_prevent_privileged_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  self_allowed_change boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> auth.uid() THEN
    -- Non-self edits by non-privileged users are already blocked by the
    -- profiles UPDATE policy; nothing else to do here.
    RETURN NEW;
  END IF;

  -- Self edit: any change outside the safe allowlist is denied.
  self_allowed_change :=
    (NEW.first_name IS NOT DISTINCT FROM OLD.first_name)
    AND (NEW.last_name IS NOT DISTINCT FROM OLD.last_name)
    AND (NEW.full_name IS NOT DISTINCT FROM OLD.full_name)
    AND (NEW.phone IS NOT DISTINCT FROM OLD.phone)
    AND (NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url)
    AND (NEW.preferred_language IS NOT DISTINCT FROM OLD.preferred_language)
    AND (NEW.preferred_locale IS NOT DISTINCT FROM OLD.preferred_locale)
    -- Every other column MUST remain unchanged.
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.pin_hash IS NOT DISTINCT FROM OLD.pin_hash)
    AND (NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id)
    AND (NEW.hourly_wage IS NOT DISTINCT FROM OLD.hourly_wage)
    AND (NEW.scheduled_start_time IS NOT DISTINCT FROM OLD.scheduled_start_time)
    AND (NEW.scheduled_end_time IS NOT DISTINCT FROM OLD.scheduled_end_time)
    AND (NEW.late_threshold_minutes IS NOT DISTINCT FROM OLD.late_threshold_minutes)
    AND (NEW.status IS NOT DISTINCT FROM OLD.status)
    AND (NEW.must_change_password IS NOT DISTINCT FROM OLD.must_change_password)
    AND (NEW.must_change_pin IS NOT DISTINCT FROM OLD.must_change_pin)
    AND (NEW.hire_date IS NOT DISTINCT FROM OLD.hire_date)
    AND (NEW.email IS NOT DISTINCT FROM OLD.email);

  IF NOT self_allowed_change THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_protect_super_admin_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_touches_super boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_super := (NEW.role::text = 'super_admin');
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_super := (NEW.role::text = 'super_admin' OR OLD.role::text = 'super_admin');
  ELSIF TG_OP = 'DELETE' THEN
    v_touches_super := (OLD.role::text = 'super_admin');
  END IF;

  IF v_touches_super THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform super admins can manage the super_admin role';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_restock_on_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.restock AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock + NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.tg_stores_prevent_platform_field_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
     OR NEW.plan_period_end IS DISTINCT FROM OLD.plan_period_end
     OR NEW.plan_cancel_at_period_end IS DISTINCT FROM OLD.plan_cancel_at_period_end
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.store_code IS DISTINCT FROM OLD.store_code THEN
    RAISE EXCEPTION 'Not allowed to modify platform-controlled store fields';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_subscription_recompute()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.store_id IS NOT NULL THEN
    PERFORM public.recompute_store_plan(NEW.store_id);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_time_entries_compute_late()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sched text;
  v_threshold int;
  v_tz text;
  v_now_local timestamp;
  v_sched_local timestamp;
  v_diff_min int;
BEGIN
  SELECT scheduled_start_time, late_threshold_minutes
    INTO v_sched, v_threshold
    FROM public.profiles WHERE id = NEW.user_id;

  IF v_sched IS NULL OR v_sched = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(time_zone, 'UTC') INTO v_tz
    FROM public.stores WHERE id = NEW.store_id;
  IF v_tz IS NULL THEN v_tz := 'UTC'; END IF;

  v_now_local := (NEW.clock_in AT TIME ZONE v_tz);
  v_sched_local := (date_trunc('day', v_now_local) + v_sched::time);
  v_diff_min := EXTRACT(EPOCH FROM (v_now_local - v_sched_local)) / 60;

  IF v_diff_min > COALESCE(v_threshold, 5) THEN
    NEW.late := true;
    NEW.late_minutes := v_diff_min;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_time_entries_prevent_privileged_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  self_allowed boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  self_allowed :=
    (NEW.clock_out IS NOT DISTINCT FROM OLD.clock_out OR OLD.clock_out IS NULL)
    AND (NEW.break_start IS NOT DISTINCT FROM OLD.break_start OR OLD.break_start IS NULL)
    AND (NEW.break_end IS NOT DISTINCT FROM OLD.break_end OR OLD.break_end IS NULL)
    AND (NEW.notes IS NOT DISTINCT FROM OLD.notes OR OLD.notes IS NULL OR NEW.notes IS NOT NULL)
    AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.clock_in IS NOT DISTINCT FROM OLD.clock_in)
    AND (NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by)
    AND (NEW.late IS NOT DISTINCT FROM OLD.late)
    AND (NEW.late_minutes IS NOT DISTINCT FROM OLD.late_minutes);

  IF NOT self_allowed THEN
    RAISE EXCEPTION 'Not allowed to modify privileged time entry fields';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_update_sale_refund_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total numeric; v_sale_total numeric;
BEGIN
  SELECT COALESCE(SUM(total),0) INTO v_total FROM public.refunds WHERE sale_id = NEW.sale_id;
  SELECT total INTO v_sale_total FROM public.sales WHERE id = NEW.sale_id;
  UPDATE public.sales SET
    refunded_amount = v_total,
    refund_status = CASE
      WHEN v_total <= 0 THEN 'none'
      WHEN v_total >= v_sale_total THEN 'full'
      ELSE 'partial'
    END,
    status = CASE WHEN NEW.refund_type = 'void' THEN 'voided' ELSE status END
  WHERE id = NEW.sale_id;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_user_roles_protect_last_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid;
  v_user  uuid;
  v_remaining int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role::text <> 'owner' THEN RETURN OLD; END IF;
    v_store := OLD.store_id; v_user := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only care when demoting away from owner.
    IF OLD.role::text = 'owner' AND NEW.role::text <> 'owner' THEN
      v_store := OLD.store_id; v_user := OLD.user_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
    FROM public.user_roles
    WHERE store_id = v_store
      AND role = 'owner'::app_role
      AND user_id <> v_user;

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'Cannot demote or remove the last owner of this business';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tier_rank(_tier text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tier
    WHEN 'business' THEN 3
    WHEN 'pro' THEN 2
    WHEN 'trial_pro' THEN 2
    WHEN 'starter' THEN 1
    ELSE 0
  END;
$function$
;

-- SECTION: ENABLE RLS
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.age_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_trial_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Tables in public WITHOUT row level security enabled (informational):
--   (none)

-- SECTION: RESET AND REGRANT TABLE PRIVILEGES
REVOKE ALL ON TABLE public.admin_login_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_support_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.age_verifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.api_rate_limit_buckets FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.business_trial_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.cash_movements FROM anon, authenticated;
REVOKE ALL ON TABLE public.categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.country_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.customers FROM anon, authenticated;
REVOKE ALL ON TABLE public.device_pairing_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.device_registrations FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_send_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_send_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_unsubscribe_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.legal_acceptances FROM anon, authenticated;
REVOKE ALL ON TABLE public.passkey_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.passkey_credentials FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_terminals FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.products FROM anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.refund_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.refunds FROM anon, authenticated;
REVOKE ALL ON TABLE public.register_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.role_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.sale_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.sale_payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.sales FROM anon, authenticated;
REVOKE ALL ON TABLE public.signup_risk_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_send_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.stores FROM anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_ticket_notes FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_tickets FROM anon, authenticated;
REVOKE ALL ON TABLE public.suppressed_emails FROM anon, authenticated;
REVOKE ALL ON TABLE public.time_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;

-- Table-level grants
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_login_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_support_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_support_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_support_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.age_verifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.age_verifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.age_verifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_rate_limit_buckets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.business_trial_registry TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cash_movements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cash_movements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cash_movements TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.country_profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.country_profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.country_profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_pairing_codes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_pairing_codes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_pairing_codes TO service_role;
GRANT DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.device_registrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_registrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.legal_acceptances TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.legal_acceptances TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.legal_acceptances TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_challenges TO service_role;
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_credentials TO anon;
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_credentials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_credentials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_terminals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_terminals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_terminals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refund_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refund_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refund_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.register_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.register_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.register_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_permissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_permissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_permissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_payments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_payments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.signup_risk_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_send_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_send_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_send_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_settings TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.stores TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stores TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_ticket_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_ticket_notes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_ticket_notes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.time_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.time_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.time_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO service_role;

-- Column-level grants (these encode the SEZA privilege-escalation protections)
GRANT INSERT(app_version) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(app_version) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(app_version) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(created_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(id) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(label) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(label) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(label) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(last_seen_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(last_seen_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(last_seen_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(last_sync_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(last_sync_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(last_sync_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(paired_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(paired_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(paired_by) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(paired_by) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(platform) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(platform) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(platform) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(revoke_reason) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(revoke_reason) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(revoke_reason) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(revoked_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(revoked_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(revoked_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(revoked_by) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(revoked_by) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(revoked_by) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(status) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(status) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(status) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(status_snapshot) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(status_snapshot) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(status_snapshot) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(store_id) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(store_id) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(updated_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(updated_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(avatar_url) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(first_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(full_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(last_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(photo_url) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(preferred_language) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(preferred_locale) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(updated_at) ON TABLE public.profiles TO authenticated;
GRANT SELECT(credentials) ON TABLE public.sms_settings TO service_role;
GRANT UPDATE(address) ON TABLE public.stores TO authenticated;
GRANT UPDATE(address_format_override) ON TABLE public.stores TO authenticated;
GRANT UPDATE(age_verification_settings) ON TABLE public.stores TO authenticated;
GRANT UPDATE(allow_cashier_quick_add) ON TABLE public.stores TO authenticated;
GRANT UPDATE(business_hours) ON TABLE public.stores TO authenticated;
GRANT UPDATE(business_type) ON TABLE public.stores TO authenticated;
GRANT UPDATE(city) ON TABLE public.stores TO authenticated;
GRANT UPDATE(country) ON TABLE public.stores TO authenticated;
GRANT UPDATE(country_code) ON TABLE public.stores TO authenticated;
GRANT UPDATE(currency) ON TABLE public.stores TO authenticated;
GRANT UPDATE(currency_symbol) ON TABLE public.stores TO authenticated;
GRANT UPDATE(date_format) ON TABLE public.stores TO authenticated;
GRANT UPDATE(email) ON TABLE public.stores TO authenticated;
GRANT UPDATE(language) ON TABLE public.stores TO authenticated;
GRANT UPDATE(locale) ON TABLE public.stores TO authenticated;
GRANT UPDATE(logo_url) ON TABLE public.stores TO authenticated;
GRANT UPDATE(name) ON TABLE public.stores TO authenticated;
GRANT UPDATE(paper_size) ON TABLE public.stores TO authenticated;
GRANT UPDATE(phone) ON TABLE public.stores TO authenticated;
GRANT UPDATE(phone_format_override) ON TABLE public.stores TO authenticated;
GRANT UPDATE(pos_display_name) ON TABLE public.stores TO authenticated;
GRANT UPDATE(receipt_footer) ON TABLE public.stores TO authenticated;
GRANT UPDATE(receipt_header) ON TABLE public.stores TO authenticated;
GRANT UPDATE(receipt_logo_url) ON TABLE public.stores TO authenticated;
GRANT UPDATE(region_code) ON TABLE public.stores TO authenticated;
GRANT UPDATE(return_policy) ON TABLE public.stores TO authenticated;
GRANT UPDATE(setup_completed_at) ON TABLE public.stores TO authenticated;
GRANT UPDATE(setup_state) ON TABLE public.stores TO authenticated;
GRANT UPDATE(show_expected_before_count) ON TABLE public.stores TO authenticated;
GRANT UPDATE(social_links) ON TABLE public.stores TO authenticated;
GRANT UPDATE(starting_cash_float) ON TABLE public.stores TO authenticated;
GRANT UPDATE(state) ON TABLE public.stores TO authenticated;
GRANT UPDATE(tax_id) ON TABLE public.stores TO authenticated;
GRANT UPDATE(tax_inclusive) ON TABLE public.stores TO authenticated;
GRANT UPDATE(tax_rate) ON TABLE public.stores TO authenticated;
GRANT UPDATE(thank_you_message) ON TABLE public.stores TO authenticated;
GRANT UPDATE(time_zone) ON TABLE public.stores TO authenticated;
GRANT UPDATE(updated_at) ON TABLE public.stores TO authenticated;
GRANT UPDATE(variance_alert_threshold) ON TABLE public.stores TO authenticated;
GRANT UPDATE(website) ON TABLE public.stores TO authenticated;
GRANT UPDATE(zip) ON TABLE public.stores TO authenticated;

-- Sequence grants
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.receipt_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.receipt_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.receipt_number_seq TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_ticket_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_ticket_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_ticket_number_seq TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_tickets_ticket_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_tickets_ticket_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;

-- SECTION: FUNCTION EXECUTE PRIVILEGES
REVOKE ALL ON FUNCTION public.activate_verified_business_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_business_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_business_trial() TO service_role;
REVOKE ALL ON FUNCTION public.admin_global_search(_q text, _limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_search(_q text, _limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_search(_q text, _limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.can_manage_employee(_actor uuid, _target uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(_actor uuid, _target uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(_actor uuid, _target uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_api_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limit_buckets() TO service_role;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(p_key_hash text, p_scope text, p_limit integer, p_window_seconds integer, p_block_seconds integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(p_key_hash text, p_scope text, p_limit integer, p_window_seconds integer, p_block_seconds integer) TO service_role;
REVOKE ALL ON FUNCTION public.current_store_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO service_role;
REVOKE ALL ON FUNCTION public.delete_email(queue_name text, message_id bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.email_for_employee_id(p_employee_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_employee_id(p_employee_id text) TO service_role;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_authenticated_write_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_authenticated_write_rate_limit() TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_employee_id() TO service_role;
REVOKE ALL ON FUNCTION public.generate_store_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_store_code() TO service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
REVOKE ALL ON FUNCTION public.has_active_plan(_store_id uuid, _min_tier text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_plan(_store_id uuid, _min_tier text) TO service_role;
REVOKE ALL ON FUNCTION public.has_admin_permission(_user_id uuid, _permission text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(_user_id uuid, _permission text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(_user_id uuid, _permission text) TO service_role;
REVOKE ALL ON FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) TO service_role;
REVOKE ALL ON FUNCTION public.has_permission(_user_id uuid, _permission text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO service_role;
REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO service_role;
REVOKE ALL ON FUNCTION public.is_last_owner(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_last_owner(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_last_owner(_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_platform_staff(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_read_only(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_read_only(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_super_admin(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text, _priority text, _subject text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text, _priority text, _subject text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text, _priority text, _subject text) TO service_role;
REVOKE ALL ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.plan_tier_for_price(_price_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_tier_for_price(_price_id text) TO service_role;
REVOKE ALL ON FUNCTION public.pos_find_pin_candidates(_store_id uuid, _fingerprint text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_find_pin_candidates(_store_id uuid, _fingerprint text) TO service_role;
REVOKE ALL ON FUNCTION public.pos_list_unfingerprinted(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_list_unfingerprinted(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid) TO service_role;
REVOKE ALL ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) TO service_role;
REVOKE ALL ON FUNCTION public.recompute_store_plan(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_store_plan(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone, p_source text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone, p_source text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone, p_source text) TO service_role;
REVOKE ALL ON FUNCTION public.seza_attach_signup_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seza_attach_signup_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seza_attach_signup_identity() TO service_role;
REVOKE ALL ON FUNCTION public.seza_prepare_new_store_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seza_prepare_new_store_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seza_prepare_new_store_trial() TO service_role;
REVOKE ALL ON FUNCTION public.simulate_trial_expiry(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_trial_expiry(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tg_assign_receipt_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_receipt_number() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_assign_receipt_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_receipt_number() TO service_role;
REVOKE ALL ON FUNCTION public.tg_assign_ticket_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_ticket_number() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_assign_ticket_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_ticket_number() TO service_role;
REVOKE ALL ON FUNCTION public.tg_decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_decrement_stock_on_sale() TO service_role;
REVOKE ALL ON FUNCTION public.tg_device_registrations_protect_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_device_registrations_protect_secret() TO service_role;
REVOKE ALL ON FUNCTION public.tg_enforce_role_exclusivity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_enforce_role_exclusivity() TO service_role;
REVOKE ALL ON FUNCTION public.tg_profiles_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_profiles_prevent_privileged_self_update() TO service_role;
REVOKE ALL ON FUNCTION public.tg_protect_super_admin_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_protect_super_admin_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_protect_super_admin_role() TO service_role;
REVOKE ALL ON FUNCTION public.tg_restock_on_refund() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_restock_on_refund() TO service_role;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.tg_stores_prevent_platform_field_writes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_stores_prevent_platform_field_writes() TO service_role;
REVOKE ALL ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_subscription_recompute() TO service_role;
REVOKE ALL ON FUNCTION public.tg_time_entries_compute_late() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_time_entries_compute_late() TO service_role;
REVOKE ALL ON FUNCTION public.tg_time_entries_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_time_entries_prevent_privileged_self_update() TO service_role;
REVOKE ALL ON FUNCTION public.tg_update_sale_refund_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_update_sale_refund_totals() TO service_role;
REVOKE ALL ON FUNCTION public.tg_user_roles_protect_last_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_user_roles_protect_last_owner() TO service_role;
REVOKE ALL ON FUNCTION public.tier_rank(_tier text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_rank(_tier text) TO anon;
GRANT EXECUTE ON FUNCTION public.tier_rank(_tier text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_rank(_tier text) TO service_role;

-- SECTION: RLS POLICIES (public schema)
CREATE POLICY admin_permissions_platform_staff_read ON public.admin_permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_staff(auth.uid()));

CREATE POLICY admin_support_sessions_merchant_read ON public.admin_support_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY admin_support_sessions_merchant_respond ON public.admin_support_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND (status = ANY (ARRAY['pending'::text, 'active'::text]))))
  WITH CHECK (((store_id = current_store_id()) AND (status = ANY (ARRAY['active'::text, 'declined'::text, 'ended'::text]))));

CREATE POLICY admin_support_sessions_super_admin_all ON public.admin_support_sessions AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Cashiers can insert their own age verifications" ON public.age_verifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((cashier_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY "Managers can read age verifications" ON public.age_verifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Employees insert their own audit entries" ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((actor_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY "Employees read their own audit entries" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((actor_id = auth.uid()));

CREATE POLICY "Managers and owners read all audit entries" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]) AND (store_id = current_store_id())));

CREATE POLICY audit_log_super_admin_select ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Cashiers insert safe drops for own open session" ON public.cash_movements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND (user_id = auth.uid()) AND (type = 'safe_drop'::text) AND (EXISTS ( SELECT 1
   FROM register_sessions rs
  WHERE ((rs.id = cash_movements.register_session_id) AND (rs.opened_by = auth.uid()) AND (rs.status = 'open'::text))))));

CREATE POLICY "Owners and admins delete cash movements" ON public.cash_movements AS PERMISSIVE FOR DELETE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])));

CREATE POLICY "Privileged members insert cash movements" ON public.cash_movements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND (user_id = auth.uid()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Store members read cash movements" ON public.cash_movements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY cash_movements_super_admin_select ON public.cash_movements AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY categories_modify ON public.categories AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY categories_select ON public.categories AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY country_profiles_select_authenticated ON public.country_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY customers_delete_mgmt ON public.customers AS PERMISSIVE FOR DELETE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY customers_insert ON public.customers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((store_id = current_store_id()));

CREATE POLICY customers_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY customers_super_admin_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY customers_update ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((store_id = current_store_id()))
  WITH CHECK ((store_id = current_store_id()));

CREATE POLICY device_pairing_codes_creator_delete ON public.device_pairing_codes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((created_by = auth.uid()));

CREATE POLICY device_pairing_codes_manager_insert ON public.device_pairing_codes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY device_pairing_codes_owner_read ON public.device_pairing_codes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((created_by = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY device_registrations_manager_read ON public.device_registrations AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY device_registrations_manager_write ON public.device_registrations AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "service_role manages send log" ON public.email_send_log AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role manages send state" ON public.email_send_state AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role manages unsubscribe tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY legal_acceptances_select_own ON public.legal_acceptances AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]))));

CREATE POLICY "Owners read own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Owners remove own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Owners rename own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY payment_attempts_super_admin_select ON public.payment_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "staff can insert payment attempts" ON public.payment_attempts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((attempted_by IS NULL) OR (attempted_by = auth.uid())) AND (store_id = current_store_id())));

CREATE POLICY "staff can read payment attempts" ON public.payment_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id IS NOT NULL) AND (store_id = current_store_id())));

CREATE POLICY "Managers can manage terminals" ON public.payment_terminals AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Managers can view store terminals" ON public.payment_terminals AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY payment_terminals_super_admin_all ON public.payment_terminals AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY products_modify ON public.products AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY products_select ON public.products AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR (has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (store_id = current_store_id()))));

CREATE POLICY profiles_super_admin_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY profiles_super_admin_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = auth.uid()) AND (status = 'active'::text)))
  WITH CHECK (((id = auth.uid()) AND (status = 'active'::text) AND (store_id = ( SELECT p.store_id
   FROM profiles p
  WHERE (p.id = auth.uid())))));

CREATE POLICY "refund_items insert by staff" ON public.refund_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role, 'cashier'::app_role]) AND (EXISTS ( SELECT 1
   FROM refunds r
  WHERE ((r.id = refund_items.refund_id) AND (r.store_id = current_store_id()))))));

CREATE POLICY "refund_items readable" ON public.refund_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM refunds r
  WHERE ((r.id = refund_items.refund_id) AND (r.store_id = current_store_id())))));

CREATE POLICY "refunds insert by staff" ON public.refunds AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role, 'cashier'::app_role]) AND (store_id = current_store_id()) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = refunds.sale_id) AND (s.store_id = current_store_id()))))));

CREATE POLICY "refunds readable by store users" ON public.refunds AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY refunds_super_admin_select ON public.refunds AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Owner/opener can update register sessions" ON public.register_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND ((opened_by = auth.uid()) OR has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))))
  WITH CHECK (((store_id = current_store_id()) AND ((opened_by = auth.uid()) OR has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))));

CREATE POLICY "Staff can open register sessions" ON public.register_sessions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((opened_by = auth.uid()) AND (store_id IN ( SELECT profiles.store_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

CREATE POLICY "Staff can view store register sessions" ON public.register_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id IN ( SELECT profiles.store_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY register_sessions_super_admin_select ON public.register_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Management can read role permissions" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Owners and admins manage role permissions" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])));

CREATE POLICY sale_items_insert ON public.sale_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND (s.cashier_id = auth.uid()) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_items_select ON public.sale_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_payments_insert ON public.sale_payments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_payments.sale_id) AND (s.cashier_id = auth.uid()) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_payments_select ON public.sale_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_payments.sale_id) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_payments_super_admin_select ON public.sale_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY sale_payments_update_mgmt ON public.sale_payments AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sales_insert ON public.sales AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((cashier_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY sales_no_delete ON public.sales AS PERMISSIVE FOR DELETE TO authenticated
  USING (false);

CREATE POLICY sales_select ON public.sales AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY sales_super_admin_select ON public.sales AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY sales_update_mgmt ON public.sales AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY sms_send_log_insert_store ON public.sms_send_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sms_send_log_select_store ON public.sms_send_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sms_send_log_update_store ON public.sms_send_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sms_settings_delete_store ON public.sms_settings AS PERMISSIVE FOR DELETE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY sms_settings_select_store ON public.sms_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])));

CREATE POLICY sms_settings_update_store ON public.sms_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY sms_settings_upsert_store ON public.sms_settings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY stores_modify ON public.stores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY stores_select ON public.stores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = current_store_id()));

CREATE POLICY stores_super_admin_select ON public.stores AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY stores_super_admin_update ON public.stores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Service role manages subscriptions" ON public.subscriptions AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users view own subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY subscriptions_super_admin_select ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY ticket_notes_merchant_insert ON public.support_ticket_notes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (internal = false) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.status = 'active'::text) AND (p.store_id = current_store_id())))) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_ticket_notes.ticket_id) AND (t.store_id = current_store_id()) AND (t.status <> 'closed'::text))))));

CREATE POLICY ticket_notes_merchant_view ON public.support_ticket_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((internal = false) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_ticket_notes.ticket_id) AND (t.store_id = current_store_id()))))));

CREATE POLICY ticket_notes_super_admin_all ON public.support_ticket_notes AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY support_tickets_merchant_insert ON public.support_tickets AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND (requester_id = auth.uid())));

CREATE POLICY support_tickets_merchant_view ON public.support_tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id IS NOT NULL) AND (store_id = current_store_id()) AND ((requester_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))));

CREATE POLICY support_tickets_super_admin_all ON public.support_tickets AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "service_role manages suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "self and managers read time entries" ON public.time_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))));

CREATE POLICY "self insert time entries" ON public.time_entries AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY "self update time entries" ON public.time_entries AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND (store_id = current_store_id())))
  WITH CHECK (((user_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY time_entries_super_admin_select ON public.time_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY super_admin_select_all_user_roles ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY user_roles_modify ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (role <> 'super_admin'::app_role)))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (role <> 'super_admin'::app_role)));

CREATE POLICY user_roles_select_own ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (store_id = current_store_id()))));

CREATE POLICY user_roles_super_admin_modify ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- SECTION: STORAGE BUCKETS AND POLICIES
-- bucket 'avatars' (public=f, file_size_limit=null, allowed_mime_types=null)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', 'f', NULL, NULL) ON CONFLICT (id) DO NOTHING;
-- bucket 'product-images' (public=f, file_size_limit=null, allowed_mime_types=null)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('product-images', 'product-images', 'f', NULL, NULL) ON CONFLICT (id) DO NOTHING;

-- storage.objects policies
CREATE POLICY avatars_admin_write ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'avatars'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (EXISTS ( SELECT 1
   FROM (profiles p_owner
     JOIN profiles p_me ON ((p_me.id = auth.uid())))
  WHERE ((p_owner.id = objects.owner) AND (p_owner.store_id IS NOT NULL) AND (p_owner.store_id = p_me.store_id))))))
  WITH CHECK (((bucket_id = 'avatars'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (EXISTS ( SELECT 1
   FROM (profiles p_owner
     JOIN profiles p_me ON ((p_me.id = auth.uid())))
  WHERE ((p_owner.id = objects.owner) AND (p_owner.store_id IS NOT NULL) AND (p_owner.store_id = p_me.store_id))))));

CREATE POLICY avatars_delete_own ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

CREATE POLICY avatars_insert_own ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY avatars_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.store_id = ( SELECT p2.store_id
           FROM profiles p2
          WHERE (p2.id = objects.owner)))))))));

CREATE POLICY avatars_update_own ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "product-images delete same store" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (profiles p_owner
     JOIN profiles p_me ON ((p_me.id = auth.uid())))
  WHERE ((p_owner.id = objects.owner) AND (p_owner.store_id IS NOT NULL) AND (p_owner.store_id = p_me.store_id)))))));

CREATE POLICY "product-images insert same store" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (owner = auth.uid())));

CREATE POLICY "product-images read same store" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'product-images'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.store_id = ( SELECT p2.store_id
           FROM profiles p2
          WHERE (p2.id = objects.owner)))))))));

CREATE POLICY "product-images update same store" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (current_store_id() IS NOT NULL) AND ((storage.foldername(name))[1] = (current_store_id())::text)))
  WITH CHECK (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (owner = auth.uid()) AND (current_store_id() IS NOT NULL) AND ((storage.foldername(name))[1] = (current_store_id())::text)));

-- other storage policies
--   (none)

-- SECTION: REALTIME
-- publication supabase_realtime: public.admin_support_sessions, public.payment_terminals, public.role_permissions, public.stores, public.support_ticket_notes, public.support_tickets, public.time_entries
-- publication supabase_realtime_messages_publication: realtime.messages_2026_08_17, realtime.messages_2026_08_18, realtime.messages_2026_08_19, realtime.messages_2026_08_20, realtime.messages_2026_08_21, realtime.messages_2026_08_22, realtime.messages_2026_08_23, realtime.messages_2026_08_24, realtime.messages_2026_08_25, realtime.messages_2026_08_26

-- realtime.messages policies
CREATE POLICY customer_display_read_own_store ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((realtime.topic() = ('customer-display:'::text || (current_store_id())::text)));

CREATE POLICY customer_display_write_own_store ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((realtime.topic() = ('customer-display:'::text || (current_store_id())::text)));

-- SECTION: QUEUES AND CRON
-- pgmq queue: auth_emails (is_partitioned=false, is_unlogged=false)
-- pgmq queue: auth_emails_dlq (is_partitioned=false, is_unlogged=false)
-- pgmq queue: transactional_emails (is_partitioned=false, is_unlogged=false)
-- pgmq queue: transactional_emails_dlq (is_partitioned=false, is_unlogged=false)
-- cron jobs currently scheduled:
--   (none)


-- Realtime publication membership (recreate on the new project).
-- NOTE: device_registrations is intentionally NOT published (it holds device secret hashes).
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_support_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_terminals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- pgmq queues used by the email pipeline.
SELECT pgmq.create('auth_emails');
SELECT pgmq.create('auth_emails_dlq');
SELECT pgmq.create('transactional_emails');
SELECT pgmq.create('transactional_emails_dlq');

-- TODO (manual, cannot be represented safely in SQL):
--   * public.email_queue_dispatch() and public.email_queue_wake() POST to a
--     hardcoded legacy app URL. Replace that URL with the current SEZA endpoint
--     deployment origin (e.g. https://app.sezapos.com/api/email/queue/process).
--   * Those functions read a Vault secret named 'email_queue_service_role_key'.
--     Create it manually: select vault.create_secret('<service role key>', 'email_queue_service_role_key');
--     Never commit the key.
--   * No cron jobs are scheduled at rest; 'process-email-queue' is created and
--     removed dynamically by email_queue_wake()/email_queue_dispatch().
--   * Auth providers (email, Google), SMTP, redirect URLs, JWT/signing keys, and
--     all project secrets are configured outside SQL.
--   * auth.users, storage objects, and all production row data are intentionally
--     excluded from this file (structure only). Seed reference data such as
--     public.country_profiles, public.admin_permissions and public.platform_settings
--     separately after applying this migration.
--   * Triggers on auth.users (handle_new_user, seza_attach_signup_identity,
--     activate_verified_business_trial) live in the auth schema and must be
--     recreated with elevated privileges on the new project; see the block below.


-- SECTION: AUTH-SCHEMA TRIGGERS (run as a superuser / via the SQL editor)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seza_attach_signup_identity();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_trial ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_trial
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.activate_verified_business_trial();

