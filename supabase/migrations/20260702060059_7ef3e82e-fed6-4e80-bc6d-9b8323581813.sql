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
