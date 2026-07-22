
-- 1) admin_permissions: drop overly-permissive read policy
DROP POLICY IF EXISTS "Authenticated can read admin permissions" ON public.admin_permissions;

-- 2) time_entries: restrict self-updates via trigger to safe columns only
CREATE OR REPLACE FUNCTION public.tg_time_entries_prevent_privileged_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  self_allowed boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  self_allowed :=
    (NEW.clock_out IS NOT DISTINCT FROM OLD.clock_out OR OLD.clock_out IS NULL)
    AND (NEW.break_start IS NOT DISTINCT FROM OLD.break_start OR OLD.break_start IS NULL)
    AND (NEW.break_end IS NOT DISTINCT FROM OLD.break_end OR OLD.break_end IS NULL)
    AND (NEW.notes IS NOT DISTINCT FROM OLD.notes OR OLD.notes IS NULL OR NEW.notes IS NOT NULL)
    AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.clock_in IS NOT DISTINCT FROM OLD.clock_in)
    AND (NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by)
    AND (NEW.late IS NOT DISTINCT FROM OLD.late)
    AND (NEW.late_minutes IS NOT DISTINCT FROM OLD.late_minutes);

  IF NOT self_allowed THEN
    RAISE EXCEPTION 'Not allowed to modify privileged time entry fields';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_time_entries_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_prevent_privileged_self_update ON public.time_entries;
CREATE TRIGGER time_entries_prevent_privileged_self_update
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_time_entries_prevent_privileged_self_update();
