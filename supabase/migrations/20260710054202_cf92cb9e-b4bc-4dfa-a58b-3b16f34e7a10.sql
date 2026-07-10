-- Replace Paddle columns with Stripe columns on subscriptions
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_paddle_subscription_id_key;
DROP INDEX IF EXISTS public.idx_subscriptions_paddle_id;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS paddle_subscription_id;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS paddle_customer_id;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_stripe_subscription_id_key') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

-- New tier mapping keyed off price_id (lookup_key, stable across sandbox/live).
CREATE OR REPLACE FUNCTION public.plan_tier_for_price(_price_id text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _price_id
    WHEN 'business_monthly' THEN 'business'
    WHEN 'pro_monthly'      THEN 'pro'
    WHEN 'starter_monthly'  THEN 'starter'
    ELSE 'starter'
  END;
$$;

-- Recompute store plan from most-recent subscription in current env,
-- keyed off price_id (webhook resolves lookup_key into this column).
CREATE OR REPLACE FUNCTION public.recompute_store_plan(_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
      plan_tier = public.plan_tier_for_price(v_sub.price_id),
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
END $function$;

-- Old function is now unused; drop it to avoid confusion.
DROP FUNCTION IF EXISTS public.plan_tier_for_product(text);

-- Backend-only helper: resolve store for a user (used by webhook via service role).
-- No RLS change needed; webhook uses service role which bypasses RLS.