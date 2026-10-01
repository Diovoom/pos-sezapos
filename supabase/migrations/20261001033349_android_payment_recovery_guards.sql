-- New guards only. No historical sale/payment/refund row is changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER POLICY cash_movements_insert ON public.cash_movements TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND store_id = (SELECT public.current_store_id())
  AND NOT public.is_platform_staff((SELECT auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cash_movements.user_id
    AND p.store_id = cash_movements.store_id AND p.status = 'active')
  AND EXISTS (SELECT 1 FROM public.register_sessions r WHERE r.id = cash_movements.register_session_id
    AND r.store_id = cash_movements.store_id)
);
-- Intentionally no session-open or opener=actor requirement: shared drawers
-- and delayed uploads after closure retain their original attribution.

CREATE SCHEMA IF NOT EXISTS seza_private;
CREATE FUNCTION seza_private.payment_reference_key(ref text, provider text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN nullif(btrim(ref),'') IS NULL THEN NULL
    WHEN btrim(ref) ~ '^pi_[A-Za-z0-9]+$' THEN 'stripe:' || btrim(ref)
    ELSE 'provider:' || coalesce(nullif(lower(btrim(provider)),''),'unspecified') || ':' || btrim(ref) END
$$;

CREATE TABLE seza_private.payment_reference_claims (
  reference_key text PRIMARY KEY,
  sale_id uuid NOT NULL,
  store_id uuid NOT NULL
);
ALTER TABLE seza_private.payment_reference_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seza_private.payment_reference_claims FROM PUBLIC, anon, authenticated;
-- Retain claims even if a sale is removed: deletion must not make a payment reusable.
LOCK TABLE public.sales, public.sale_payments IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT reference_key FROM (
      SELECT seza_private.payment_reference_key(terminal_ref) reference_key, id sale_id
      FROM public.sales WHERE btrim(terminal_ref) ~ '^pi_[A-Za-z0-9]+$'
      UNION ALL
      SELECT seza_private.payment_reference_key(provider_reference,provider),sale_id
      FROM public.sale_payments WHERE (method <> 'cash' OR btrim(provider_reference) ~ '^pi_[A-Za-z0-9]+$') AND nullif(btrim(provider_reference),'') IS NOT NULL
    ) refs GROUP BY reference_key HAVING count(DISTINCT sale_id)>1
  ) THEN RAISE EXCEPTION 'Payment references already fund different sales; reconcile before applying this migration'; END IF;
END $$;
INSERT INTO seza_private.payment_reference_claims(reference_key,sale_id,store_id)
SELECT DISTINCT seza_private.payment_reference_key(terminal_ref),id,store_id
FROM public.sales WHERE btrim(terminal_ref) ~ '^pi_[A-Za-z0-9]+$'
UNION
SELECT DISTINCT seza_private.payment_reference_key(provider_reference,provider),sale_id,store_id
FROM public.sale_payments WHERE (method <> 'cash' OR btrim(provider_reference) ~ '^pi_[A-Za-z0-9]+$') AND nullif(btrim(provider_reference),'') IS NOT NULL;

CREATE FUNCTION seza_private.claim_payment_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, seza_private AS $$
DECLARE k text; sid uuid; st uuid;
BEGIN
  IF TG_TABLE_NAME='sales' THEN
    IF btrim(NEW.terminal_ref) !~ '^pi_[A-Za-z0-9]+$' OR NEW.terminal_ref IS NULL THEN RETURN NEW; END IF;
    k := seza_private.payment_reference_key(NEW.terminal_ref); sid := NEW.id; st := NEW.store_id;
  ELSE
    IF NEW.method='cash' AND coalesce(btrim(NEW.provider_reference),'') !~ '^pi_[A-Za-z0-9]+$' THEN RETURN NEW; END IF;
    k := seza_private.payment_reference_key(NEW.provider_reference,NEW.provider);
    IF k IS NULL THEN RETURN NEW; END IF;
    sid := NEW.sale_id; st := NEW.store_id;
    IF NOT EXISTS(SELECT 1 FROM public.sales WHERE id=sid AND store_id=st) THEN
      RAISE EXCEPTION 'Payment sale/store mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  INSERT INTO seza_private.payment_reference_claims VALUES(k,sid,st) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM seza_private.payment_reference_claims WHERE reference_key=k AND sale_id=sid AND store_id=st) THEN
    RAISE EXCEPTION 'Payment reference already belongs to another sale' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION seza_private.claim_payment_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_claim_sale_payment AFTER INSERT OR UPDATE OF provider_reference,provider,sale_id,store_id,method
ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION seza_private.claim_payment_reference();
CREATE TRIGGER seza_claim_sale_terminal AFTER INSERT OR UPDATE OF terminal_ref,store_id,id
ON public.sales FOR EACH ROW EXECUTE FUNCTION seza_private.claim_payment_reference();
CREATE UNIQUE INDEX sale_payments_processor_reference_unique
ON public.sale_payments (seza_private.payment_reference_key(provider_reference,provider))
WHERE (method <> 'cash' OR btrim(provider_reference) ~ '^pi_[A-Za-z0-9]+$') AND nullif(btrim(provider_reference),'') IS NOT NULL;

-- Keep the already-tested atomic transaction unchanged behind a narrow wrapper.
ALTER FUNCTION public.finalize_pos_sale(jsonb,jsonb,jsonb) SET SCHEMA seza_private;
ALTER FUNCTION seza_private.finalize_pos_sale(jsonb,jsonb,jsonb) RENAME TO finalize_pos_sale_impl;
REVOKE ALL ON FUNCTION seza_private.finalize_pos_sale_impl(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.finalize_pos_sale(p_sale jsonb,p_items jsonb,p_payments jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,seza_private AS $$
DECLARE k text; sid uuid; found_id uuid; original jsonb; old_sale public.sales%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR (p_sale->>'store_id')::uuid IS DISTINCT FROM public.current_store_id() THEN
    RAISE EXCEPTION 'Unauthorized sale context' USING ERRCODE='42501';
  END IF;
  FOR k IN SELECT DISTINCT key FROM (
    SELECT seza_private.payment_reference_key(p_sale->>'terminal_ref') key WHERE btrim(p_sale->>'terminal_ref') ~ '^pi_[A-Za-z0-9]+$'
    UNION ALL SELECT seza_private.payment_reference_key(value->>'provider_reference',value->>'provider')
      FROM jsonb_array_elements(p_payments) WHERE value->>'method'<>'cash' OR btrim(value->>'provider_reference') ~ '^pi_[A-Za-z0-9]+$'
  ) refs WHERE key IS NOT NULL ORDER BY key LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('seza.payment:'||k,0));
    SELECT sale_id INTO found_id FROM seza_private.payment_reference_claims WHERE reference_key=k;
    IF found_id IS NOT NULL THEN
      IF sid IS NOT NULL AND sid<>found_id THEN RAISE EXCEPTION 'Payments belong to different sales' USING ERRCODE='23514'; END IF;
      sid := found_id;
    END IF;
  END LOOP;
  IF sid IS NOT NULL AND sid IS DISTINCT FROM (p_sale->>'id')::uuid THEN
    SELECT * INTO old_sale FROM public.sales WHERE id=sid;
    IF old_sale.store_id IS DISTINCT FROM public.current_store_id() OR old_sale.cashier_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Payment reference conflict' USING ERRCODE='42501';
    END IF;
    SELECT request_payload INTO original FROM public.pos_sale_requests WHERE sale_id=sid;
    IF original IS NULL OR ((original->'sale')-'id'-'idempotency_key') IS DISTINCT FROM (p_sale-'id'-'idempotency_key'-'synced_from_offline'-'offline_created_at')
      OR original->'items' IS DISTINCT FROM p_items OR original->'payments' IS DISTINCT FROM p_payments THEN
      RAISE EXCEPTION 'Payment reference replay payload differs; review required' USING ERRCODE='23514';
    END IF;
    p_sale := original->'sale';
  END IF;
  RETURN seza_private.finalize_pos_sale_impl(p_sale,p_items,p_payments);
END $$;
REVOKE ALL ON FUNCTION public.finalize_pos_sale(jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(jsonb,jsonb,jsonb) TO authenticated,service_role;

-- Durable checkout is saved BEFORE requesting a PaymentIntent. Client roles
-- cannot insert, edit, acknowledge, or finalize these records directly.
CREATE TABLE public.pos_terminal_checkouts (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  cashier_id uuid NOT NULL REFERENCES auth.users(id),
  stripe_account_id text NOT NULL,
  environment text NOT NULL CHECK(environment IN ('live','sandbox')),
  request_payload jsonb NOT NULL,
  payment_intent_id text UNIQUE,
  amount_cents integer NOT NULL CHECK(amount_cents>=50),
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sale_result jsonb,
  acknowledged boolean NOT NULL DEFAULT false
);
ALTER TABLE public.pos_terminal_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_terminal_checkouts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pos_terminal_checkouts TO service_role;
CREATE UNIQUE INDEX pos_terminal_checkout_pending_actor ON public.pos_terminal_checkouts(store_id,cashier_id)
WHERE NOT acknowledged;

CREATE FUNCTION public.prepare_terminal_checkout(p_actor uuid,p_store uuid,p_account text,p_environment text,p_request jsonb,p_amount integer,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.pos_terminal_checkouts%ROWTYPE; cid uuid := (p_request->'sale'->>'id')::uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND store_id=p_store AND status='active')
    OR public.is_platform_staff(p_actor) OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.store_id=p_store AND
        (ur.role::text IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.role_permissions rp
          WHERE rp.store_id=p_store AND rp.role=ur.role AND rp.permission IN ('sales.create','*')))
    ) THEN
    RAISE EXCEPTION 'Checkout actor not authorized' USING ERRCODE='42501';
  END IF;
  IF (p_request->'sale'->>'store_id')::uuid IS DISTINCT FROM p_store THEN RAISE EXCEPTION 'Checkout store mismatch' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('seza.checkout.actor:'||p_actor::text,0));
  SELECT * INTO c FROM public.pos_terminal_checkouts WHERE id=cid;
  IF c.id IS NOT NULL THEN
    IF c.store_id<>p_store OR c.cashier_id<>p_actor OR c.stripe_account_id<>p_account OR c.environment<>p_environment
      OR c.request_payload IS DISTINCT FROM p_request OR c.amount_cents<>p_amount OR c.currency<>p_currency THEN
      RAISE EXCEPTION 'Checkout retry differs from original' USING ERRCODE='23514';
    END IF;
    IF c.acknowledged AND c.sale_result IS NULL THEN RAISE EXCEPTION 'Checkout was canceled; reopen tender selection' USING ERRCODE='23514'; END IF;
    RETURN to_jsonb(c);
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_terminal_checkouts WHERE store_id=p_store AND cashier_id=p_actor AND NOT acknowledged) THEN
    RAISE EXCEPTION 'An earlier checkout needs recovery before another payment' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.pos_terminal_checkouts(id,store_id,cashier_id,stripe_account_id,environment,request_payload,amount_cents,currency)
  VALUES(cid,p_store,p_actor,p_account,p_environment,p_request,p_amount,p_currency) RETURNING * INTO c;
  RETURN to_jsonb(c);
END $$;

-- Only the server invokes this AFTER retrieving/verifying succeeded status at
-- Stripe. Financial status is never accepted from Android request bodies.
CREATE FUNCTION public.finalize_terminal_checkout(p_checkout uuid,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.pos_terminal_checkouts%ROWTYPE; sale jsonb; payments jsonb; result jsonb; prior_uid text;
BEGIN
  SELECT * INTO c FROM public.pos_terminal_checkouts WHERE id=p_checkout FOR UPDATE;
  IF c.id IS NULL OR c.payment_intent_id IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'Checkout payment mismatch' USING ERRCODE='23514'; END IF;
  IF c.sale_result IS NOT NULL THEN RETURN c.sale_result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.cashier_id AND store_id=c.store_id AND status='active')
    OR public.is_platform_staff(c.cashier_id) THEN RAISE EXCEPTION 'Original employee needs review' USING ERRCODE='42501'; END IF;
  sale := jsonb_set(c.request_payload->'sale','{terminal_ref}',to_jsonb(p_reference));
  SELECT jsonb_agg(CASE WHEN value->>'method'='cash' THEN value ELSE
    value || jsonb_build_object('provider','stripe_terminal','provider_reference',p_reference) END ORDER BY ord)
  INTO payments FROM jsonb_array_elements(c.request_payload->'payments') WITH ORDINALITY AS x(value,ord);
  prior_uid := current_setting('request.jwt.claim.sub',true);
  PERFORM set_config('request.jwt.claim.sub',c.cashier_id::text,true);
  result := public.finalize_pos_sale(sale,c.request_payload->'items',payments);
  PERFORM set_config('request.jwt.claim.sub',coalesce(prior_uid,''),true);
  UPDATE public.pos_terminal_checkouts SET sale_result=result WHERE id=c.id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.prepare_terminal_checkout(uuid,uuid,text,text,jsonb,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_terminal_checkout(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_terminal_checkout(uuid,uuid,text,text,jsonb,integer,text),public.finalize_terminal_checkout(uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
