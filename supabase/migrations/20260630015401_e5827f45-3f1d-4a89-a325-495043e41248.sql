
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
