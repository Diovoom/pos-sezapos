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