-- Reconfirmed against the current upload and live PostgreSQL catalog.
-- Existing users, sales, inventory and membership are not rewritten.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store_id uuid;
  v_is_merchant boolean;
  v_business_name text;
  v_full_name text;
  v_phone text;
  v_country text;
  v_tz text;
  v_emp_id text;
  v_is_platform boolean;
begin
  v_is_platform :=
    public.is_platform_staff(new.id);

  if v_is_platform then return new; end if;

  v_business_name := new.raw_user_meta_data->>'business_name';
  v_is_merchant := new.invited_at is null and v_business_name is not null and length(trim(v_business_name)) > 0;
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', new.email);
  v_phone := coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'business_phone');
  v_country := coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'US');
  v_tz := coalesce(nullif(new.raw_user_meta_data->>'time_zone', ''), 'America/New_York');


  if v_is_merchant then
    insert into public.stores (
      name, phone, address, zip, country, time_zone, email, store_code,
      trial_ends_at, plan_tier, plan_status, plan_period_end
    ) values (
      coalesce(v_business_name, 'My Store'),
      v_phone,
      nullif(new.raw_user_meta_data->>'business_address',''),
      nullif(new.raw_user_meta_data->>'business_zip',''),
      v_country, v_tz, new.email,
      public.generate_store_code(),
      now() + interval '14 days',
      'trial_pro', 'trialing', now() + interval '14 days'
    ) returning id into v_store_id;
  end if;


  v_emp_id := public.generate_employee_id();

  insert into public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name, phone)
  values (
    new.id, v_full_name, new.email, v_store_id, v_emp_id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    v_phone
  );

  if v_is_merchant then
    insert into public.user_roles (user_id, role, store_id) values (new.id, 'owner', v_store_id);
  end if;

  return new;
end
$function$;

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
  v_registry public.business_trial_registry%rowtype;
BEGIN
  IF old.email_confirmed_at IS NOT NULL OR new.email_confirmed_at IS NULL THEN
    RETURN new;
  END IF;

  SELECT p.store_id INTO v_store_id
  FROM public.profiles p
  WHERE p.id = new.id;

  IF v_store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = new.id AND store_id = v_store_id AND role = 'owner'::public.app_role) THEN
    RETURN new;
  END IF;

  SELECT s.business_fingerprint INTO v_fp
  FROM public.stores s
  WHERE s.id = v_store_id;

  -- Mark this transaction as an internal platform write before touching
  -- fields protected from merchant-side updates.
  PERFORM set_config('seza.internal_platform_write', 'on', true);

  IF v_fp IS NULL OR v_fp = '' THEN
    UPDATE public.stores
       SET trial_eligibility = 'review',
           business_verification_status = 'review',
           plan_status = 'inactive',
           trial_ends_at = NULL,
           plan_period_end = NULL
     WHERE id = v_store_id;
    PERFORM set_config('seza.internal_platform_write', 'off', true);
    RETURN new;
  END IF;

  SELECT coalesce(default_trial_days, 14)
    INTO v_days
    FROM public.platform_settings
   WHERE id = 'global';

  v_days := coalesce(v_days, 14);

  INSERT INTO public.business_trial_registry (
    business_fingerprint,
    normalized_business_name,
    first_user_id,
    first_store_id
  )
  VALUES (
    v_fp,
    lower(trim(coalesce(new.raw_user_meta_data->>'business_name', 'business'))),
    new.id,
    v_store_id
  )
  ON CONFLICT (business_fingerprint) DO NOTHING;

  SELECT * INTO v_registry
  FROM public.business_trial_registry
  WHERE business_fingerprint = v_fp
  FOR UPDATE;

  IF v_registry.status IN ('trial_used', 'trial_active', 'paid', 'blocked')
     AND v_registry.first_user_id IS DISTINCT FROM new.id THEN
    UPDATE public.stores
       SET trial_eligibility = 'used',
           plan_status = 'inactive',
           trial_ends_at = NULL,
           plan_period_end = NULL
     WHERE id = v_store_id;
    PERFORM set_config('seza.internal_platform_write', 'off', true);
    RETURN new;
  END IF;

  UPDATE public.business_trial_registry
     SET status = 'trial_active',
         first_user_id = coalesce(first_user_id, new.id),
         first_store_id = coalesce(first_store_id, v_store_id),
         trial_started_at = coalesce(trial_started_at, now()),
         trial_ends_at = coalesce(trial_ends_at, now() + make_interval(days => v_days)),
         updated_at = now()
   WHERE business_fingerprint = v_fp;

  UPDATE public.stores
     SET business_verification_status = 'verified',
         trial_eligibility = 'eligible',
         plan_tier = 'trial_pro',
         plan_status = 'trialing',
         trial_ends_at = coalesce(trial_ends_at, now() + make_interval(days => v_days)),
         plan_period_end = coalesce(plan_period_end, now() + make_interval(days => v_days))
   WHERE id = v_store_id;

  PERFORM set_config('seza.internal_platform_write', 'off', true);
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seza_attach_signup_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_store uuid; v_fp text;
begin
  v_fp := new.raw_user_meta_data->>'business_fingerprint';
  if v_fp is null or v_fp='' then return new; end if;
  select store_id into v_store from public.profiles where id=new.id;
  if v_store is not null and exists (select 1 from public.user_roles where user_id=new.id and store_id=v_store and role='owner'::public.app_role) then
    update public.stores
       set business_fingerprint=v_fp,
           plan_status='inactive',
           trial_ends_at=null,
           plan_period_end=null,
           trial_eligibility='pending',
           business_verification_status='pending'
     where id=v_store;
  end if;
  return new;
end
$function$;


-- All current and future platform roles are outside the merchant allowlist.
DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (store_id = (SELECT public.current_store_id())
 AND role::text IN ('owner','admin','manager','cashier')
 AND (SELECT public.has_any_role(auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=user_roles.user_id AND p.store_id=user_roles.store_id));
CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
USING (store_id = (SELECT public.current_store_id()) AND role::text IN ('owner','admin','manager','cashier')
 AND (SELECT public.has_any_role(auth.uid(),ARRAY['owner','admin']::public.app_role[])))
WITH CHECK (store_id = (SELECT public.current_store_id()) AND role::text IN ('owner','admin','manager','cashier')
 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=user_roles.user_id AND p.store_id=user_roles.store_id));
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
USING (store_id = (SELECT public.current_store_id()) AND role::text IN ('owner','admin','manager','cashier')
 AND (SELECT public.has_any_role(auth.uid(),ARRAY['owner','admin']::public.app_role[])));

CREATE OR REPLACE FUNCTION public.tg_validate_role_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 IF TG_OP <> 'DELETE' AND NEW.role::text IN ('owner','admin','manager','cashier') THEN
   IF NEW.store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND store_id=NEW.store_id) THEN
     RAISE EXCEPTION 'Merchant role and employee must belong to the same store' USING ERRCODE='23514';
   END IF;
 END IF;
 IF (TG_OP <> 'DELETE' AND NEW.role::text NOT IN ('owner','admin','manager','cashier'))
    OR (TG_OP <> 'INSERT' AND OLD.role::text NOT IN ('owner','admin','manager','cashier')) THEN
   IF coalesce(auth.role(),'') <> 'service_role' AND NOT public.is_super_admin(auth.uid()) THEN
     RAISE EXCEPTION 'Only authorized platform provisioning can manage platform roles' USING ERRCODE='42501';
   END IF;
   IF TG_OP <> 'DELETE' AND NEW.role::text NOT IN ('owner','admin','manager','cashier') AND NEW.store_id IS NOT NULL THEN
     RAISE EXCEPTION 'Platform roles cannot carry merchant membership' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_validate_role_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_validate_role_tenant BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_role_tenant();

-- The authenticated Admin catalog policy invokes this read-only helper.
GRANT EXECUTE ON FUNCTION public.is_platform_staff(uuid) TO authenticated;

-- Invitation membership is provisioned together, after trusted server validation.
CREATE OR REPLACE FUNCTION public.provision_invited_employee(p_user_id uuid,p_store_id uuid,p_role text,p_fields jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 IF p_role NOT IN ('manager','cashier') THEN RAISE EXCEPTION 'Invalid employee role' USING ERRCODE='23514'; END IF;
 PERFORM id FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='23503'; END IF;
 IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=p_user_id) THEN
   RAISE EXCEPTION 'Invitation already has membership' USING ERRCODE='23514';
 END IF;
 UPDATE public.profiles SET store_id=p_store_id,first_name=p_fields->>'first_name',last_name=p_fields->>'last_name',
   full_name=btrim(concat_ws(' ',p_fields->>'first_name',p_fields->>'last_name')), phone=nullif(p_fields->>'phone',''),
   hire_date=nullif(p_fields->>'hire_date','')::date, must_change_password=true,status='active'
 WHERE id=p_user_id AND store_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unassigned invited profile not found' USING ERRCODE='23514'; END IF;
 UPDATE public.user_roles SET role=p_role::public.app_role WHERE user_id=p_user_id AND store_id=p_store_id;
 IF NOT FOUND THEN INSERT INTO public.user_roles(user_id,store_id,role) VALUES(p_user_id,p_store_id,p_role::public.app_role); END IF;
END $$;
REVOKE ALL ON FUNCTION public.provision_invited_employee(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_invited_employee(uuid,uuid,text,jsonb) TO service_role;

-- Compatibility for already-deployed invitation code: its trusted profile
-- attachment creates the role that its subsequent role UPDATE expects.
CREATE OR REPLACE FUNCTION public.tg_attach_trusted_invitation_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 IF auth.role()='service_role' AND OLD.store_id IS NULL AND NEW.store_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.id AND invited_at IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.id) THEN
   INSERT INTO public.user_roles(user_id,store_id,role) VALUES(NEW.id,NEW.store_id,'cashier');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_attach_trusted_invitation_role() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_attach_trusted_invitation_role AFTER UPDATE OF store_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_attach_trusted_invitation_role();

-- Validate cross-reference ownership independently of RLS or API entry point.
CREATE OR REPLACE FUNCTION public.tg_validate_sale_item_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
DECLARE v_store uuid;
BEGIN
 SELECT store_id INTO v_store FROM public.sales WHERE id=NEW.sale_id;
 IF v_store IS NULL THEN RAISE EXCEPTION 'Sale store is required' USING ERRCODE='23503'; END IF;
 IF NEW.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND store_id=v_store) THEN
   RAISE EXCEPTION 'Product does not belong to sale store' USING ERRCODE='23503';
 END IF;
 IF NEW.quantity<=0 OR NEW.unit_price<0 OR NEW.line_total<0 THEN
   RAISE EXCEPTION 'Invalid sale item values' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_validate_sale_item_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_validate_sale_item_tenant BEFORE INSERT OR UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_sale_item_tenant();

CREATE OR REPLACE FUNCTION public.tg_validate_refund_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 IF NEW.store_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.sales WHERE id=NEW.sale_id AND store_id=NEW.store_id) THEN
   RAISE EXCEPTION 'Refund and original sale must belong to the same store' USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_validate_refund_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_validate_refund_tenant BEFORE INSERT OR UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_refund_tenant();

CREATE OR REPLACE FUNCTION public.tg_validate_refund_item_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
DECLARE v_refund public.refunds%rowtype; v_item public.sale_items%rowtype; v_refunded numeric;
BEGIN
 SELECT * INTO v_refund FROM public.refunds WHERE id=NEW.refund_id;
 IF v_refund.store_id IS NULL THEN RAISE EXCEPTION 'Refund store is required' USING ERRCODE='23503'; END IF;
 IF NEW.quantity<=0 OR NEW.unit_price<0 OR NEW.line_total<0 THEN RAISE EXCEPTION 'Invalid refund item values' USING ERRCODE='23514'; END IF;
 IF NEW.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND store_id=v_refund.store_id) THEN
   RAISE EXCEPTION 'Product does not belong to refund store' USING ERRCODE='23503';
 END IF;
 IF NEW.sale_item_id IS NULL THEN RAISE EXCEPTION 'Original sale item is required for a refund' USING ERRCODE='23503'; END IF;
 SELECT * INTO v_item FROM public.sale_items WHERE id=NEW.sale_item_id FOR UPDATE;
 IF v_item.id IS NULL OR v_item.sale_id IS DISTINCT FROM v_refund.sale_id OR v_item.product_id IS DISTINCT FROM NEW.product_id THEN
   RAISE EXCEPTION 'Refund item does not match the original sale item' USING ERRCODE='23503';
 END IF;
 SELECT coalesce(sum(ri.quantity),0) INTO v_refunded FROM public.refund_items ri
 JOIN public.refunds r ON r.id=ri.refund_id WHERE ri.sale_item_id=NEW.sale_item_id AND ri.id<>NEW.id AND r.status='completed';
 IF v_refund.status='completed' AND v_refunded+NEW.quantity>v_item.quantity THEN
   RAISE EXCEPTION 'Refund quantity exceeds the quantity sold' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_validate_refund_item_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_validate_refund_item_tenant BEFORE INSERT OR UPDATE ON public.refund_items
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_refund_item_tenant();

-- Keep five ticket creations per hour; normal conversation activity has its
-- own larger, bounded budget. Timestamp touches no longer consume creation quota.
DROP TRIGGER IF EXISTS seza_write_limit_support_tickets ON public.support_tickets;
CREATE TRIGGER seza_write_limit_support_tickets BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.enforce_authenticated_write_rate_limit('5','3600','3600');
CREATE TRIGGER seza_write_limit_support_ticket_activity BEFORE UPDATE OR DELETE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.enforce_authenticated_write_rate_limit('600','3600','600');

CREATE OR REPLACE FUNCTION public.tg_decrement_stock_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.product_id is not null then
    update public.products
       set stock = greatest(0, stock - new.quantity),
           updated_at = now()
     where id = new.product_id
       and store_id = (select store_id from public.sales where id=new.sale_id)
       and track_inventory = true;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.tg_restock_on_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.restock = true and new.product_id is not null then
    update public.products
       set stock = stock + new.quantity,
           updated_at = now()
     where id = new.product_id
       and store_id = (select store_id from public.refunds where id=new.refund_id)
       and track_inventory = true;
  end if;
  return new;
end
$function$;

CREATE TABLE public.pos_sale_requests(
 sale_id uuid PRIMARY KEY REFERENCES public.sales(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.stores(id), request_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.pos_sale_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_sale_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pos_sale_requests TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_request jsonb;
  v_original_request jsonb;
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

  -- Different retries of one logical sale cannot race stock validation.
  PERFORM pg_advisory_xact_lock(hashtextextended('seza.sale.id:' || v_sale_id::text,0));
  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('seza.sale.key:' || v_idempotency_key,0));
  END IF;
  v_request := jsonb_build_object('sale',p_sale-'synced_from_offline'-'offline_created_at','items',p_items,'payments',p_payments);
  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE idempotency_key = v_idempotency_key LIMIT 1 FOR UPDATE;
  END IF;
  IF v_sale.id IS NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE id = v_sale_id LIMIT 1 FOR UPDATE;
  END IF;

  IF v_sale.id IS NOT NULL THEN
    IF v_sale.store_id IS DISTINCT FROM v_store_id OR v_sale.cashier_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Idempotency key belongs to another sale context' USING ERRCODE='42501';
    END IF;
    IF NULLIF(p_sale->>'id','') IS NOT NULL AND v_sale.id IS DISTINCT FROM v_sale_id THEN
      RAISE EXCEPTION 'Sale ID does not match original operation' USING ERRCODE='23514';
    END IF;
    SELECT request_payload INTO v_original_request FROM public.pos_sale_requests WHERE sale_id=v_sale.id;
    IF v_original_request IS NOT NULL AND v_original_request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'Idempotency payload does not match original sale' USING ERRCODE='23514';
    END IF;
    -- Legacy operations predate snapshots; compare persisted items and payments.
    IF v_original_request IS NULL AND (
      (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (
        SELECT jsonb_build_object('product_id',product_id,'product_name',product_name,'quantity',quantity,'unit_price',unit_price,'line_total',line_total) x
        FROM public.sale_items WHERE sale_id=v_sale.id) rows)
      IS DISTINCT FROM
      (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (
        SELECT jsonb_build_object('product_id',nullif(value->>'product_id','')::uuid,'product_name',value->>'product_name','quantity',(value->>'quantity')::numeric,'unit_price',(value->>'unit_price')::numeric,'line_total',(value->>'line_total')::numeric) x
        FROM jsonb_array_elements(p_items)) rows)
      OR (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (
        SELECT jsonb_build_object('method',method,'amount',amount,'provider',provider,'provider_reference',provider_reference,'status',status) x
        FROM public.sale_payments WHERE sale_id=v_sale.id) rows)
      IS DISTINCT FROM
      (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (
        SELECT jsonb_build_object('method',value->>'method','amount',(value->>'amount')::numeric,'provider',nullif(value->>'provider',''),'provider_reference',nullif(value->>'provider_reference',''),'status',coalesce(nullif(value->>'status',''),'completed')) x
        FROM jsonb_array_elements(p_payments)) rows)
    ) THEN
      RAISE EXCEPTION 'Legacy sale replay does not match persisted items or payments' USING ERRCODE='23514';
    END IF;
    IF abs(v_sale.subtotal-v_subtotal)>0.01 OR abs(v_sale.tax-v_tax)>0.01 OR abs(v_sale.discount-v_discount)>0.01
       OR abs(v_sale.total-v_total)>0.01 OR abs(v_sale.final_amount_charged-v_final_amount_charged)>0.01
       OR v_sale.payment_method::text IS DISTINCT FROM coalesce(nullif(p_sale->>'payment_method',''),'cash')
       OR v_sale.terminal_ref IS DISTINCT FROM nullif(p_sale->>'terminal_ref','') THEN
      RAISE EXCEPTION 'Sale replay does not match original header' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('id',v_sale.id,'receipt_number',v_sale.receipt_number,'created_at',v_sale.created_at,
      'store_id',v_sale.store_id,'cash_base_total',v_sale.cash_base_total,'card_price_adjustment',v_sale.card_price_adjustment,
      'final_amount_charged',v_sale.final_amount_charged,'already_existed',true);
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
      RAISE EXCEPTION 'Concurrent sale identity conflict; retry the same operation' USING ERRCODE='40001';
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

  INSERT INTO public.pos_sale_requests(sale_id,store_id,request_payload) VALUES(v_sale.id,v_store_id,v_request);
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