
-- 1) Restrict profile self-updates: prevent privileged column tampering via trigger
CREATE OR REPLACE FUNCTION public.tg_profiles_prevent_privileged_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role and privileged users (owner/admin) to change these columns.
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.pin_hash IS DISTINCT FROM OLD.pin_hash
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.hourly_wage IS DISTINCT FROM OLD.hourly_wage
       OR NEW.scheduled_start_time IS DISTINCT FROM OLD.scheduled_start_time
       OR NEW.scheduled_end_time IS DISTINCT FROM OLD.scheduled_end_time
       OR NEW.late_threshold_minutes IS DISTINCT FROM OLD.late_threshold_minutes
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.must_change_pin IS DISTINCT FROM OLD.must_change_pin
       OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
       OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_self_update ON public.profiles;
CREATE TRIGGER profiles_prevent_privileged_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_prevent_privileged_self_update();

-- 2) cash_movements: require privileged role on insert
DROP POLICY IF EXISTS "Store members insert cash movements" ON public.cash_movements;
CREATE POLICY "Privileged members insert cash movements"
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (
  store_id = public.current_store_id()
  AND user_id = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);

-- 3) sms_send_log: require privileged role on insert/update
DROP POLICY IF EXISTS sms_send_log_insert_store ON public.sms_send_log;
CREATE POLICY sms_send_log_insert_store
ON public.sms_send_log
FOR INSERT
TO authenticated
WITH CHECK (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);

DROP POLICY IF EXISTS sms_send_log_update_store ON public.sms_send_log;
CREATE POLICY sms_send_log_update_store
ON public.sms_send_log
FOR UPDATE
TO authenticated
USING (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
)
WITH CHECK (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);
