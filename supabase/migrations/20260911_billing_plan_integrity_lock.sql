CREATE OR REPLACE FUNCTION public.recompute_store_plan_for_environment(_store_id uuid, _environment text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub RECORD;
  v_trial_ends timestamptz;
  v_last_period_end timestamptz;
  v_now timestamptz := now();
  v_env text := lower(coalesce(_environment, 'sandbox'));
BEGIN
  IF v_env NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'Invalid billing environment';
  END IF;

  PERFORM set_config('seza.internal_platform_write', 'on', true);

  SELECT trial_ends_at
    INTO v_trial_ends
    FROM public.stores
   WHERE id = _store_id;

  SELECT max(s.current_period_end)
    INTO v_last_period_end
    FROM public.subscriptions s
   WHERE s.store_id = _store_id
     AND s.environment = v_env;

  SELECT s.*
    INTO v_sub
    FROM public.subscriptions s
   WHERE s.store_id = _store_id
     AND s.environment = v_env
     AND (
       s.status IN ('active','trialing','past_due','paused')
       OR (s.status = 'canceled' AND s.current_period_end > v_now)
     )
   ORDER BY
     CASE s.status
       WHEN 'active' THEN 0
       WHEN 'trialing' THEN 1
       WHEN 'past_due' THEN 2
       WHEN 'paused' THEN 3
       WHEN 'canceled' THEN 4
       ELSE 5
     END,
     s.current_period_end DESC NULLS LAST,
     s.updated_at DESC,
     s.created_at DESC
   LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.stores
       SET plan_tier = public.plan_tier_for_price(v_sub.price_id),
           plan_status = v_sub.status,
           plan_period_end = v_sub.current_period_end,
           plan_cancel_at_period_end = COALESCE(v_sub.cancel_at_period_end, false)
     WHERE id = _store_id;
  ELSIF v_trial_ends IS NOT NULL AND v_trial_ends > v_now THEN
    UPDATE public.stores
       SET plan_tier = 'trial_pro',
           plan_status = 'trialing',
           plan_period_end = v_trial_ends,
           plan_cancel_at_period_end = false
     WHERE id = _store_id;
  ELSE
    UPDATE public.stores
       SET plan_tier = 'expired',
           plan_status = 'expired',
           plan_period_end = COALESCE(v_last_period_end, v_trial_ends),
           plan_cancel_at_period_end = false
     WHERE id = _store_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_store_plan(_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recompute_store_plan_for_environment(
    _store_id,
    CASE
      WHEN current_setting('app.environment', true) = 'live' THEN 'live'
      ELSE 'sandbox'
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_subscription_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.store_id IS DISTINCT FROM NEW.store_id
       OR OLD.environment IS DISTINCT FROM NEW.environment THEN
      IF OLD.store_id IS NOT NULL THEN
        PERFORM public.recompute_store_plan_for_environment(
          OLD.store_id,
          COALESCE(OLD.environment, 'sandbox')
        );
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.store_id IS NOT NULL THEN
      PERFORM public.recompute_store_plan_for_environment(
        OLD.store_id,
        COALESCE(OLD.environment, 'sandbox')
      );
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.store_id IS NOT NULL THEN
    PERFORM public.recompute_store_plan_for_environment(
      NEW.store_id,
      COALESCE(NEW.environment, 'sandbox')
    );
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_subscription_recompute ON public.subscriptions;
CREATE TRIGGER trg_subscription_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_recompute();

REVOKE ALL ON FUNCTION public.recompute_store_plan_for_environment(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_store_plan_for_environment(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.recompute_store_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_store_plan(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_subscription_recompute() TO service_role;
