-- Fix password recovery / email verification failing with:
-- "Database error updating user" caused by a protected stores UPDATE
-- inside the auth.users email-verification trigger.

CREATE OR REPLACE FUNCTION public.tg_stores_prevent_platform_field_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR public.is_platform_staff(auth.uid())
     OR current_setting('seza.internal_platform_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF new.plan_status IS DISTINCT FROM old.plan_status
     OR new.plan_tier IS DISTINCT FROM old.plan_tier
     OR new.plan_period_end IS DISTINCT FROM old.plan_period_end
     OR new.plan_cancel_at_period_end IS DISTINCT FROM old.plan_cancel_at_period_end
     OR new.trial_ends_at IS DISTINCT FROM old.trial_ends_at
     OR new.suspended_at IS DISTINCT FROM old.suspended_at
     OR new.suspended_reason IS DISTINCT FROM old.suspended_reason
     OR new.admin_notes IS DISTINCT FROM old.admin_notes
     OR new.store_code IS DISTINCT FROM old.store_code
     OR new.stripe_connected_account_id IS DISTINCT FROM old.stripe_connected_account_id
     OR new.stripe_connect_status IS DISTINCT FROM old.stripe_connect_status
     OR new.stripe_card_payments_status IS DISTINCT FROM old.stripe_card_payments_status
     OR new.stripe_terminal_location_id IS DISTINCT FROM old.stripe_terminal_location_id
     OR new.stripe_onboarding_completed_at IS DISTINCT FROM old.stripe_onboarding_completed_at THEN
    RAISE EXCEPTION 'Not allowed to modify platform-controlled store fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_verified_business_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF v_store_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT s.business_fingerprint INTO v_fp
  FROM public.stores s
  WHERE s.id = v_store_id;

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
$$;

REVOKE ALL ON FUNCTION public.activate_verified_business_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_business_trial() TO service_role;
