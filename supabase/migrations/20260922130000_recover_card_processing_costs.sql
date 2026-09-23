BEGIN;

-- Merchant-level dual pricing configuration. The processing model is stored
-- centrally so checkout logic does not depend on processor-specific constants.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS recover_card_processing_costs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_processing_percent numeric(7,6) NOT NULL DEFAULT 0.027000,
  ADD COLUMN IF NOT EXISTS card_processing_fixed_fee numeric(12,2) NOT NULL DEFAULT 0.05;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_card_processing_percent_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_card_processing_percent_check
      CHECK (card_processing_percent >= 0 AND card_processing_percent < 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_card_processing_fixed_fee_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_card_processing_fixed_fee_check
      CHECK (card_processing_fixed_fee >= 0);
  END IF;
END
$$;

-- Keep product/tax revenue separate from the extra card price collected.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_base_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS card_price_adjustment numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount_charged numeric(12,2),
  ADD COLUMN IF NOT EXISTS processing_fee_estimate numeric(12,2),
  ADD COLUMN IF NOT EXISTS processor_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_merchant_net numeric(12,2),
  ADD COLUMN IF NOT EXISTS merchant_net_amount numeric(12,2);

UPDATE public.sales
SET cash_base_total = COALESCE(cash_base_total, total),
    final_amount_charged = COALESCE(final_amount_charged, total),
    card_price_adjustment = COALESCE(card_price_adjustment, 0)
WHERE cash_base_total IS NULL
   OR final_amount_charged IS NULL
   OR card_price_adjustment IS NULL;

ALTER TABLE public.sales
  ALTER COLUMN cash_base_total SET NOT NULL,
  ALTER COLUMN cash_base_total SET DEFAULT 0,
  ALTER COLUMN final_amount_charged SET NOT NULL,
  ALTER COLUMN final_amount_charged SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_card_price_adjustment_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_card_price_adjustment_check CHECK (card_price_adjustment >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_cash_base_total_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_cash_base_total_check CHECK (cash_base_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_final_amount_charged_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_final_amount_charged_check CHECK (final_amount_charged >= 0);
  END IF;
END
$$;

-- Enforce the ownership boundary even if someone bypasses the dashboard UI.
-- Owners may toggle cost recovery. Processor rates are service-controlled.
CREATE OR REPLACE FUNCTION public.tg_protect_card_processing_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.recover_card_processing_costs IS DISTINCT FROM OLD.recover_card_processing_costs THEN
    IF auth.role() <> 'service_role'
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_roles ur
         WHERE ur.user_id = auth.uid()
           AND ur.store_id = OLD.id
           AND ur.role = 'owner'::public.app_role
       ) THEN
      RAISE EXCEPTION 'Only the business owner can change card-processing cost recovery'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.card_processing_percent IS DISTINCT FROM OLD.card_processing_percent
     OR NEW.card_processing_fixed_fee IS DISTINCT FROM OLD.card_processing_fixed_fee THEN
    IF auth.role() <> 'service_role' THEN
      RAISE EXCEPTION 'Card-processing pricing is managed by SEZA'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_protect_card_processing_pricing ON public.stores;
CREATE TRIGGER stores_protect_card_processing_pricing
BEFORE UPDATE OF recover_card_processing_costs, card_processing_percent, card_processing_fixed_fee
ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.tg_protect_card_processing_pricing();

REVOKE ALL ON FUNCTION public.tg_protect_card_processing_pricing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_protect_card_processing_pricing() TO service_role;

CREATE OR REPLACE FUNCTION public.set_recover_card_processing_costs(p_enabled boolean)
RETURNS TABLE (
  recover_card_processing_costs boolean,
  card_processing_percent numeric,
  card_processing_fixed_fee numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid := public.current_store_id();
BEGIN
  IF v_user_id IS NULL OR v_store_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.store_id = v_store_id
      AND ur.role = 'owner'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Only the business owner can change this setting' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.stores s
     SET recover_card_processing_costs = COALESCE(p_enabled, false)
   WHERE s.id = v_store_id
  RETURNING
    s.recover_card_processing_costs,
    s.card_processing_percent,
    s.card_processing_fixed_fee;
END;
$$;

REVOKE ALL ON FUNCTION public.set_recover_card_processing_costs(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recover_card_processing_costs(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_recover_card_processing_costs(boolean) TO service_role;

-- Atomic checkout remains the source of truth. sales.total continues to be the
-- merchandise/tax cash/base total; payment allocations reconcile to the actual
-- amount charged, which can include the pre-disclosed card price adjustment.
CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_sale jsonb,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb
)
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
  v_cash_base_total numeric := 0;
  v_card_price_adjustment numeric := 0;
  v_final_amount_charged numeric := 0;
  v_processing_fee_estimate numeric;
  v_processor_fee_amount numeric;
  v_estimated_merchant_net numeric;
  v_merchant_net_amount numeric;
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
  v_cash_base_total := COALESCE(NULLIF(p_sale->>'cash_base_total', '')::numeric, v_total);
  v_card_price_adjustment := COALESCE(NULLIF(p_sale->>'card_price_adjustment', '')::numeric, 0);
  v_final_amount_charged := COALESCE(
    NULLIF(p_sale->>'final_amount_charged', '')::numeric,
    v_cash_base_total + v_card_price_adjustment
  );
  v_processing_fee_estimate := NULLIF(p_sale->>'processing_fee_estimate', '')::numeric;
  v_processor_fee_amount := NULLIF(p_sale->>'processor_fee_amount', '')::numeric;
  v_estimated_merchant_net := NULLIF(p_sale->>'estimated_merchant_net', '')::numeric;
  v_merchant_net_amount := NULLIF(p_sale->>'merchant_net_amount', '')::numeric;

  IF v_subtotal < 0 OR v_tax < 0 OR v_discount < 0 OR v_total < 0
     OR v_cash_base_total < 0 OR v_card_price_adjustment < 0 OR v_final_amount_charged < 0 THEN
    RAISE EXCEPTION 'Sale monetary values cannot be negative' USING ERRCODE = '23514';
  END IF;
  IF v_processing_fee_estimate < 0 OR v_processor_fee_amount < 0
     OR v_estimated_merchant_net < 0 OR v_merchant_net_amount < 0 THEN
    RAISE EXCEPTION 'Payment cost values cannot be negative' USING ERRCODE = '23514';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Sale discount cannot exceed subtotal' USING ERRCODE = '23514';
  END IF;
  IF abs(v_total - (v_subtotal - v_discount + v_tax)) > 0.01 THEN
    RAISE EXCEPTION 'Sale total does not match subtotal, discount, and tax' USING ERRCODE = '23514';
  END IF;
  IF abs(v_cash_base_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Cash/base total does not match the merchandise sale total' USING ERRCODE = '23514';
  END IF;
  IF abs(v_final_amount_charged - (v_cash_base_total + v_card_price_adjustment)) > 0.01 THEN
    RAISE EXCEPTION 'Final amount charged does not match the cash/base price plus card adjustment'
      USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash') = 'cash'
     AND v_card_price_adjustment > 0.01 THEN
    RAISE EXCEPTION 'Cash sales cannot contain a card price adjustment' USING ERRCODE = '23514';
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
  IF v_final_amount_charged > 0 AND jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'A paid sale must include a payment allocation' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_payments) > 0
     AND abs(v_payments_total - v_final_amount_charged) > 0.01 THEN
    RAISE EXCEPTION 'Payment allocations do not match the final amount charged' USING ERRCODE = '23514';
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
        id, store_id, cashier_id, subtotal, tax, discount, total,
        cash_base_total, card_price_adjustment, final_amount_charged,
        processing_fee_estimate, processor_fee_amount, estimated_merchant_net, merchant_net_amount,
        payment_method, amount_tendered, change_due, terminal_ref, register_session_id, status,
        customer_name, idempotency_key, synced_from_offline, offline_created_at,
        customer_id, order_type, table_label, guest_count, kitchen_status, external_order_ref
      ) VALUES (
        v_sale_id, v_store_id, v_user_id, v_subtotal, v_tax, v_discount, v_total,
        v_cash_base_total, v_card_price_adjustment, v_final_amount_charged,
        v_processing_fee_estimate, v_processor_fee_amount, v_estimated_merchant_net, v_merchant_net_amount,
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
     OR abs(v_sale.total - v_total) > 0.01
     OR abs(v_sale.cash_base_total - v_cash_base_total) > 0.01
     OR abs(v_sale.card_price_adjustment - v_card_price_adjustment) > 0.01
     OR abs(v_sale.final_amount_charged - v_final_amount_charged) > 0.01 THEN
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
      INSERT INTO public.sale_payments (
        sale_id, store_id, method, amount, provider, provider_reference, status, metadata
      )
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
    'cash_base_total', v_sale.cash_base_total,
    'card_price_adjustment', v_sale.card_price_adjustment,
    'final_amount_charged', v_sale.final_amount_charged,
    'already_existed', NOT v_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.finalize_pos_sale(jsonb, jsonb, jsonb) IS
  'Atomically records POS sale, items and payment allocations while keeping dual-pricing adjustment separate from merchandise revenue.';

COMMIT;
