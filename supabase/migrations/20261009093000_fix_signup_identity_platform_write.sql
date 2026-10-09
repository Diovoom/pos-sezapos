-- Registration fails with SQLSTATE P0001 because the trusted signup trigger
-- updates protected plan fields without its internal-platform-write context.
-- Leave the stores protection trigger and merchant restrictions unchanged.
CREATE OR REPLACE FUNCTION public.seza_attach_signup_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid;
  v_fp text;
  v_previous_platform_write text;
BEGIN
  v_fp := NEW.raw_user_meta_data->>'business_fingerprint';
  IF v_fp IS NULL OR v_fp = '' THEN
    RETURN NEW;
  END IF;

  SELECT store_id INTO v_store
    FROM public.profiles
   WHERE id = NEW.id;

  IF v_store IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.user_roles
        WHERE user_id = NEW.id
          AND store_id = v_store
          AND role = 'owner'::public.app_role
     ) THEN
    -- Match the trusted email-verification trigger, but restore any prior
    -- transaction-local context instead of widening client write access.
    v_previous_platform_write := current_setting('seza.internal_platform_write', true);
    PERFORM set_config('seza.internal_platform_write', 'on', true);
    BEGIN
      UPDATE public.stores
         SET business_fingerprint = v_fp,
             plan_status = 'inactive',
             trial_ends_at = NULL,
             plan_period_end = NULL,
             trial_eligibility = 'pending',
             business_verification_status = 'pending'
       WHERE id = v_store;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('seza.internal_platform_write', coalesce(v_previous_platform_write, ''), true);
      RAISE;
    END;
    PERFORM set_config('seza.internal_platform_write', coalesce(v_previous_platform_write, ''), true);
  END IF;

  RETURN NEW;
END;
$function$;
