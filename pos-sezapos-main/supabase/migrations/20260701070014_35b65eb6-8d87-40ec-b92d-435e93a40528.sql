
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
