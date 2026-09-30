
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS processor text,
  ADD COLUMN IF NOT EXISTS processor_refund_id text,
  ADD COLUMN IF NOT EXISTS processor_refund_status text,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS failure_message text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS refunds_store_idempotency_key_uidx
  ON public.refunds(store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_processor_refund_id_uidx
  ON public.refunds(processor, processor_refund_id)
  WHERE processor IS NOT NULL AND processor_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refunds_sale_status_idx
  ON public.refunds(sale_id, status);

DROP POLICY IF EXISTS refunds_insert ON public.refunds;
DROP POLICY IF EXISTS refunds_update ON public.refunds;
DROP POLICY IF EXISTS refund_items_insert ON public.refund_items;

CREATE OR REPLACE FUNCTION public.tg_validate_refund_item_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_refund public.refunds%rowtype;
  v_item public.sale_items%rowtype;
  v_reserved numeric;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id=NEW.refund_id;
  IF v_refund.store_id IS NULL THEN
    RAISE EXCEPTION 'Refund store is required' USING ERRCODE='23503';
  END IF;
  IF NEW.quantity<=0 OR NEW.unit_price<0 OR NEW.line_total<0 THEN
    RAISE EXCEPTION 'Invalid refund item values' USING ERRCODE='23514';
  END IF;
  IF NEW.product_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.products WHERE id=NEW.product_id AND store_id=v_refund.store_id
  ) THEN
    RAISE EXCEPTION 'Product does not belong to refund store' USING ERRCODE='23503';
  END IF;
  IF NEW.sale_item_id IS NULL THEN
    RAISE EXCEPTION 'Original sale item is required for a refund' USING ERRCODE='23503';
  END IF;

  SELECT * INTO v_item FROM public.sale_items WHERE id=NEW.sale_item_id FOR UPDATE;
  IF v_item.id IS NULL
     OR v_item.sale_id IS DISTINCT FROM v_refund.sale_id
     OR v_item.product_id IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'Refund item does not match the original sale item' USING ERRCODE='23503';
  END IF;

  SELECT coalesce(sum(ri.quantity),0) INTO v_reserved
  FROM public.refund_items ri
  JOIN public.refunds r ON r.id=ri.refund_id
  WHERE ri.sale_item_id=NEW.sale_item_id
    AND ri.id<>NEW.id
    AND r.status IN ('pending','completed');

  IF v_refund.status IN ('pending','completed') AND v_reserved+NEW.quantity>v_item.quantity THEN
    RAISE EXCEPTION 'Refund quantity exceeds the quantity sold' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.tg_restock_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_store_id uuid;
BEGIN
  SELECT status, store_id INTO v_status, v_store_id
  FROM public.refunds WHERE id=NEW.refund_id;

  IF v_status='completed' AND NEW.restock=true AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products
       SET stock=stock+NEW.quantity, updated_at=now()
     WHERE id=NEW.product_id
       AND store_id=v_store_id
       AND track_inventory=true;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.tg_restock_refund_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.products p
       SET stock=p.stock+x.quantity,
           updated_at=now()
      FROM (
        SELECT ri.product_id, sum(ri.quantity) AS quantity
        FROM public.refund_items ri
        WHERE ri.refund_id=NEW.id
          AND ri.restock=true
          AND ri.product_id IS NOT NULL
        GROUP BY ri.product_id
      ) x
     WHERE p.id=x.product_id
       AND p.store_id=NEW.store_id
       AND p.track_inventory=true;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS refunds_restock_on_completion ON public.refunds;
CREATE TRIGGER refunds_restock_on_completion
AFTER UPDATE OF status ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_restock_refund_on_completion();

CREATE OR REPLACE FUNCTION public.tg_update_sale_refund_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_refunded numeric;
  v_total numeric;
BEGIN
  SELECT coalesce(sum(r.total),0) INTO v_refunded
  FROM public.refunds r
  WHERE r.sale_id=NEW.sale_id AND r.status='completed';

  SELECT coalesce(s.final_amount_charged,s.total) INTO v_total
  FROM public.sales s WHERE s.id=NEW.sale_id;

  UPDATE public.sales
     SET refunded_amount=v_refunded,
         refund_status=CASE
           WHEN v_refunded<=0 THEN 'none'
           WHEN v_refunded>=v_total-0.01 THEN 'full'
           ELSE 'partial'
         END,
         status=CASE
           WHEN v_refunded>=v_total-0.01 THEN 'refunded'
           ELSE status
         END
   WHERE id=NEW.sale_id;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS refunds_update_sale_totals ON public.refunds;
CREATE TRIGGER refunds_update_sale_totals
AFTER INSERT OR UPDATE OF status,total ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_update_sale_refund_totals();

CREATE OR REPLACE FUNCTION public.tg_validate_refund_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status='completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Completed refunds are immutable' USING ERRCODE='23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS refunds_validate_status_transition ON public.refunds;
CREATE TRIGGER refunds_validate_status_transition
BEFORE UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_refund_status_transition();

CREATE OR REPLACE FUNCTION public.prepare_pos_refund(p_refund jsonb, p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_sale_id uuid;
  v_cashier_id uuid;
  v_approver_id uuid;
  v_key text;
  v_type text;
  v_reason text;
  v_notes text;
  v_restock boolean;
  v_processor text;
  v_sale public.sales%rowtype;
  v_refund public.refunds%rowtype;
  v_sale_item public.sale_items%rowtype;
  v_requested jsonb;
  v_effective jsonb := '[]'::jsonb;
  v_input jsonb;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_item_id uuid;
  v_qty numeric;
  v_reserved_qty numeric;
  v_reserved_total numeric;
  v_gross numeric := 0;
  v_ratio numeric := 0;
  v_discount_share numeric := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_base_total numeric := 0;
  v_card_adjustment numeric := 0;
  v_total numeric := 0;
  v_sale_final numeric := 0;
  v_sale_cash_base numeric := 0;
  v_remaining numeric := 0;
BEGIN
  IF p_refund IS NULL OR jsonb_typeof(p_refund)<>'object' THEN
    RAISE EXCEPTION 'p_refund must be an object' USING ERRCODE='22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN
    RAISE EXCEPTION 'p_items must be an array' USING ERRCODE='22023';
  END IF;

  v_store_id := nullif(p_refund->>'store_id','')::uuid;
  v_sale_id := nullif(p_refund->>'sale_id','')::uuid;
  v_cashier_id := nullif(p_refund->>'cashier_id','')::uuid;
  v_approver_id := nullif(p_refund->>'approver_id','')::uuid;
  v_key := nullif(btrim(p_refund->>'idempotency_key'),'');
  v_type := coalesce(nullif(btrim(p_refund->>'refund_type'),''),'partial');
  v_reason := coalesce(nullif(btrim(p_refund->>'reason'),''),'other');
  v_notes := nullif(btrim(p_refund->>'notes'),'');
  v_restock := coalesce((p_refund->>'restock')::boolean,true);
  v_processor := nullif(btrim(p_refund->>'processor'),'');

  IF v_store_id IS NULL OR v_sale_id IS NULL OR v_cashier_id IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'Refund store, sale, cashier and idempotency key are required' USING ERRCODE='23502';
  END IF;
  IF length(v_key)>200 THEN
    RAISE EXCEPTION 'Refund idempotency key is too long' USING ERRCODE='22023';
  END IF;
  IF v_type NOT IN ('partial','full','exchange','store_credit','void') THEN
    RAISE EXCEPTION 'Unsupported refund type' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id=v_sale_id AND store_id=v_store_id
  FOR UPDATE;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Sale not found for this store' USING ERRCODE='23503';
  END IF;

  v_input := jsonb_build_object(
    'sale_id',v_sale_id,
    'store_id',v_store_id,
    'cashier_id',v_cashier_id,
    'approver_id',v_approver_id,
    'idempotency_key',v_key,
    'refund_type',v_type,
    'reason',v_reason,
    'notes',v_notes,
    'restock',v_restock,
    'processor',v_processor,
    'items',p_items
  );

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE store_id=v_store_id AND idempotency_key=v_key
  LIMIT 1
  FOR UPDATE;

  IF v_refund.id IS NOT NULL THEN
    IF coalesce(v_refund.request_payload->'input','null'::jsonb) IS DISTINCT FROM v_input THEN
      RAISE EXCEPTION 'Refund retry payload does not match the original request' USING ERRCODE='23514';
    END IF;

    IF v_refund.status='failed' THEN
      PERFORM si.id
      FROM public.sale_items si
      JOIN public.refund_items own ON own.sale_item_id=si.id AND own.refund_id=v_refund.id
      ORDER BY si.id
      FOR UPDATE OF si;

      IF EXISTS (
        SELECT 1
        FROM public.refund_items own
        JOIN public.sale_items si ON si.id=own.sale_item_id
        WHERE own.refund_id=v_refund.id
          AND own.quantity + coalesce((
            SELECT sum(other.quantity)
            FROM public.refund_items other
            JOIN public.refunds r2 ON r2.id=other.refund_id
            WHERE other.sale_item_id=own.sale_item_id
              AND other.refund_id<>v_refund.id
              AND r2.status IN ('pending','completed')
          ),0) > si.quantity
      ) THEN
        RAISE EXCEPTION 'Refund items are no longer available to retry' USING ERRCODE='23514';
      END IF;

      SELECT coalesce(sum(r.total),0) INTO v_reserved_total
      FROM public.refunds r
      WHERE r.sale_id=v_sale_id
        AND r.id<>v_refund.id
        AND r.status IN ('pending','completed');
      v_sale_final := coalesce(v_sale.final_amount_charged,v_sale.total,0);
      IF v_reserved_total+v_refund.total>v_sale_final+0.01 THEN
        RAISE EXCEPTION 'Refund amount is no longer available to retry' USING ERRCODE='23514';
      END IF;

      UPDATE public.refunds
      SET status='pending', failure_message=NULL, updated_at=now()
      WHERE id=v_refund.id
      RETURNING * INTO v_refund;
    END IF;

    RETURN jsonb_build_object(
      'refund',to_jsonb(v_refund),
      'effective_items',coalesce(v_refund.request_payload->'effective_items','[]'::jsonb),
      'already_existed',true
    );
  END IF;

  PERFORM id FROM public.sale_items WHERE sale_id=v_sale_id ORDER BY id FOR UPDATE;

  IF v_type IN ('full','void') THEN
    FOR v_sale_item IN SELECT * FROM public.sale_items WHERE sale_id=v_sale_id ORDER BY id
    LOOP
      SELECT coalesce(sum(ri.quantity),0) INTO v_reserved_qty
      FROM public.refund_items ri
      JOIN public.refunds r ON r.id=ri.refund_id
      WHERE ri.sale_item_id=v_sale_item.id AND r.status IN ('pending','completed');
      v_qty := v_sale_item.quantity-v_reserved_qty;
      IF v_qty>0 THEN
        v_effective := v_effective || jsonb_build_array(jsonb_build_object(
          'sale_item_id',v_sale_item.id,
          'product_id',v_sale_item.product_id,
          'product_name',v_sale_item.product_name,
          'quantity',v_qty,
          'unit_price',v_sale_item.unit_price,
          'line_total',round(v_qty*v_sale_item.unit_price,2),
          'restock',v_restock
        ));
        v_gross := v_gross + v_qty*v_sale_item.unit_price;
      END IF;
    END LOOP;
  ELSE
    IF jsonb_array_length(p_items)=0 THEN
      RAISE EXCEPTION 'Select at least one item to refund' USING ERRCODE='23514';
    END IF;
    FOR v_requested IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
      v_item_id := nullif(v_requested->>'sale_item_id','')::uuid;
      v_qty := coalesce((v_requested->>'quantity')::numeric,0);
      IF v_item_id IS NULL OR v_qty<=0 THEN
        RAISE EXCEPTION 'Refund item and positive quantity are required' USING ERRCODE='23514';
      END IF;
      IF v_item_id=ANY(v_seen) THEN
        RAISE EXCEPTION 'Duplicate refund item' USING ERRCODE='23514';
      END IF;
      v_seen := array_append(v_seen,v_item_id);

      SELECT * INTO v_sale_item
      FROM public.sale_items
      WHERE id=v_item_id AND sale_id=v_sale_id;
      IF v_sale_item.id IS NULL THEN
        RAISE EXCEPTION 'Refund item does not belong to this sale' USING ERRCODE='23503';
      END IF;

      SELECT coalesce(sum(ri.quantity),0) INTO v_reserved_qty
      FROM public.refund_items ri
      JOIN public.refunds r ON r.id=ri.refund_id
      WHERE ri.sale_item_id=v_item_id AND r.status IN ('pending','completed');
      IF v_reserved_qty+v_qty>v_sale_item.quantity THEN
        RAISE EXCEPTION 'Refund quantity exceeds the remaining quantity sold' USING ERRCODE='23514';
      END IF;

      v_effective := v_effective || jsonb_build_array(jsonb_build_object(
        'sale_item_id',v_sale_item.id,
        'product_id',v_sale_item.product_id,
        'product_name',v_sale_item.product_name,
        'quantity',v_qty,
        'unit_price',v_sale_item.unit_price,
        'line_total',round(v_qty*v_sale_item.unit_price,2),
        'restock',v_restock
      ));
      v_gross := v_gross + v_qty*v_sale_item.unit_price;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_effective)=0 OR v_gross<=0 THEN
    RAISE EXCEPTION 'Nothing remains to refund' USING ERRCODE='23514';
  END IF;

  v_sale_final := coalesce(v_sale.final_amount_charged,v_sale.total,0);
  v_sale_cash_base := coalesce(v_sale.cash_base_total,v_sale.total,0);
  SELECT coalesce(sum(r.total),0) INTO v_reserved_total
  FROM public.refunds r
  WHERE r.sale_id=v_sale_id AND r.status IN ('pending','completed');
  v_remaining := greatest(0,round(v_sale_final-v_reserved_total,2));
  IF v_remaining<=0 THEN
    RAISE EXCEPTION 'This sale has no refundable balance remaining' USING ERRCODE='23514';
  END IF;

  IF coalesce(v_sale.subtotal,0)>0 THEN
    v_ratio := least(1,greatest(0,v_gross/v_sale.subtotal));
  ELSE
    v_ratio := 1;
  END IF;
  v_discount_share := round(coalesce(v_sale.discount,0)*v_ratio,2);
  v_subtotal := greatest(0,round(v_gross-v_discount_share,2));
  v_tax := greatest(0,round(coalesce(v_sale.tax,0)*v_ratio,2));
  v_base_total := greatest(0,round(v_subtotal+v_tax,2));
  IF v_sale_cash_base>0 AND coalesce(v_sale.card_price_adjustment,0)>0 THEN
    v_card_adjustment := greatest(0,round(v_base_total*coalesce(v_sale.card_price_adjustment,0)/v_sale_cash_base,2));
  END IF;

  IF v_type IN ('full','void') THEN
    v_total := v_remaining;
  ELSE
    v_total := least(v_remaining,round(v_base_total+v_card_adjustment,2));
  END IF;
  IF v_total<=0 THEN
    RAISE EXCEPTION 'Calculated refund amount must be greater than zero' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.refunds(
    sale_id,store_id,cashier_id,approver_id,refund_type,reason,notes,
    subtotal,tax,total,payment_method,status,idempotency_key,processor,
    request_payload,updated_at
  ) VALUES (
    v_sale_id,v_store_id,v_cashier_id,v_approver_id,v_type,v_reason,v_notes,
    v_subtotal,v_tax,v_total,v_sale.payment_method,'pending',v_key,v_processor,
    jsonb_build_object(
      'input',v_input,
      'effective_items',v_effective,
      'computed',jsonb_build_object(
        'subtotal',v_subtotal,
        'tax',v_tax,
        'base_total',v_base_total,
        'card_adjustment',v_card_adjustment,
        'total',v_total
      )
    ),now()
  ) RETURNING * INTO v_refund;

  INSERT INTO public.refund_items(
    refund_id,sale_item_id,product_id,product_name,quantity,unit_price,line_total,restock
  )
  SELECT
    v_refund.id,
    nullif(item->>'sale_item_id','')::uuid,
    nullif(item->>'product_id','')::uuid,
    item->>'product_name',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'line_total')::numeric,
    coalesce((item->>'restock')::boolean,true)
  FROM jsonb_array_elements(v_effective) rows(item);

  RETURN jsonb_build_object(
    'refund',to_jsonb(v_refund),
    'effective_items',v_effective,
    'already_existed',false
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.complete_pos_refund(
  p_refund_id uuid,
  p_processor_refund_id text DEFAULT NULL,
  p_processor_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_refund public.refunds%rowtype;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund not found' USING ERRCODE='23503';
  END IF;
  IF v_refund.status='completed' THEN
    RETURN to_jsonb(v_refund);
  END IF;
  IF v_refund.status NOT IN ('pending','failed') THEN
    RAISE EXCEPTION 'Refund cannot be completed from status %',v_refund.status USING ERRCODE='23514';
  END IF;

  UPDATE public.refunds
  SET status='completed',
      processor_refund_id=coalesce(nullif(p_processor_refund_id,''),processor_refund_id),
      processor_refund_status=coalesce(nullif(p_processor_status,''),processor_refund_status),
      failure_message=NULL,
      updated_at=now()
  WHERE id=p_refund_id
  RETURNING * INTO v_refund;
  RETURN to_jsonb(v_refund);
END
$function$;

CREATE OR REPLACE FUNCTION public.fail_pos_refund(
  p_refund_id uuid,
  p_processor_status text DEFAULT NULL,
  p_failure_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_refund public.refunds%rowtype;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund not found' USING ERRCODE='23503';
  END IF;
  IF v_refund.status='completed' THEN
    RETURN to_jsonb(v_refund);
  END IF;
  UPDATE public.refunds
  SET status='failed',
      processor_refund_status=coalesce(nullif(p_processor_status,''),processor_refund_status),
      failure_message=left(nullif(p_failure_message,''),500),
      updated_at=now()
  WHERE id=p_refund_id
  RETURNING * INTO v_refund;
  RETURN to_jsonb(v_refund);
END
$function$;

REVOKE ALL ON FUNCTION public.prepare_pos_refund(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_pos_refund(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_pos_refund(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_pos_refund(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_pos_refund(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_pos_refund(uuid,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.tg_restock_refund_on_completion() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tg_validate_refund_status_transition() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tg_restock_refund_on_completion() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_validate_refund_status_transition() TO service_role;
