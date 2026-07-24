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