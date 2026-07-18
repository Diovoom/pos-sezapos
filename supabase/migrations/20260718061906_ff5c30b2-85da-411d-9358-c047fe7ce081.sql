
CREATE OR REPLACE FUNCTION public.tg_stores_prevent_platform_field_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
     OR NEW.plan_period_end IS DISTINCT FROM OLD.plan_period_end
     OR NEW.plan_cancel_at_period_end IS DISTINCT FROM OLD.plan_cancel_at_period_end
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.store_code IS DISTINCT FROM OLD.store_code THEN
    RAISE EXCEPTION 'Not allowed to modify platform-controlled store fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_prevent_platform_field_writes ON public.stores;
CREATE TRIGGER stores_prevent_platform_field_writes
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_stores_prevent_platform_field_writes();
