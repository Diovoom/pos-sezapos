CREATE OR REPLACE FUNCTION public.complete_pos_refund(p_refund_id uuid, p_processor_refund_id text DEFAULT NULL::text, p_processor_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_refund public.refunds%rowtype; v_sale_id uuid; v_limit numeric; v_reserved numeric;
BEGIN
  SELECT sale_id INTO v_sale_id FROM public.refunds WHERE id=p_refund_id;
  -- Use the same lock order as prepare_pos_refund: sale, then refund.
  SELECT coalesce(final_amount_charged,total) INTO v_limit FROM public.sales WHERE id=v_sale_id FOR UPDATE;
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

  IF v_refund.processor='stripe' AND (coalesce(p_processor_status,'')<>'succeeded' OR coalesce(p_processor_refund_id,'') NOT LIKE 're_%') THEN
    RAISE EXCEPTION 'A successful processor refund is required' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(total),0) INTO v_reserved FROM public.refunds
    WHERE sale_id=v_sale_id AND id<>p_refund_id AND status IN ('pending','completed');
  IF v_reserved+v_refund.total>v_limit+0.01 OR EXISTS(
    SELECT 1 FROM public.refund_items own JOIN public.sale_items si ON si.id=own.sale_item_id
    WHERE own.refund_id=p_refund_id AND own.quantity+coalesce((
      SELECT sum(other.quantity) FROM public.refund_items other JOIN public.refunds r ON r.id=other.refund_id
      WHERE other.sale_item_id=own.sale_item_id AND other.refund_id<>p_refund_id AND r.status IN ('pending','completed')
    ),0)>si.quantity
  ) THEN RAISE EXCEPTION 'Refund reservation changed; reconciliation is required' USING ERRCODE='23514'; END IF;

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
$function$
;
REVOKE ALL ON FUNCTION public.complete_pos_refund(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_refund(uuid,text,text) TO service_role;
