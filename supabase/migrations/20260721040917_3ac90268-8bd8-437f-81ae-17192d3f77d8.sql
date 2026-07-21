-- ================================================================
-- Employee management security hardening
-- ================================================================

-- 1) Strict allowlist for self-service profile updates.
--    Only these columns may be changed by the row's owner unless the caller
--    is a privileged user (owner/admin) or service_role.
CREATE OR REPLACE FUNCTION public.tg_profiles_prevent_privileged_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  self_allowed_change boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> auth.uid() THEN
    -- Non-self edits by non-privileged users are already blocked by the
    -- profiles UPDATE policy; nothing else to do here.
    RETURN NEW;
  END IF;

  -- Self edit: any change outside the safe allowlist is denied.
  self_allowed_change :=
    (NEW.first_name IS NOT DISTINCT FROM OLD.first_name)
    AND (NEW.last_name IS NOT DISTINCT FROM OLD.last_name)
    AND (NEW.full_name IS NOT DISTINCT FROM OLD.full_name)
    AND (NEW.phone IS NOT DISTINCT FROM OLD.phone)
    AND (NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url)
    AND (NEW.preferred_language IS NOT DISTINCT FROM OLD.preferred_language)
    AND (NEW.preferred_locale IS NOT DISTINCT FROM OLD.preferred_locale)
    -- Every other column MUST remain unchanged.
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.pin_hash IS NOT DISTINCT FROM OLD.pin_hash)
    AND (NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id)
    AND (NEW.hourly_wage IS NOT DISTINCT FROM OLD.hourly_wage)
    AND (NEW.scheduled_start_time IS NOT DISTINCT FROM OLD.scheduled_start_time)
    AND (NEW.scheduled_end_time IS NOT DISTINCT FROM OLD.scheduled_end_time)
    AND (NEW.late_threshold_minutes IS NOT DISTINCT FROM OLD.late_threshold_minutes)
    AND (NEW.status IS NOT DISTINCT FROM OLD.status)
    AND (NEW.must_change_password IS NOT DISTINCT FROM OLD.must_change_password)
    AND (NEW.must_change_pin IS NOT DISTINCT FROM OLD.must_change_pin)
    AND (NEW.hire_date IS NOT DISTINCT FROM OLD.hire_date)
    AND (NEW.email IS NOT DISTINCT FROM OLD.email);

  IF NOT self_allowed_change THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_profiles_prevent_privileged_self_update()
  FROM PUBLIC, anon, authenticated;

-- 2) Helper: is this user the last remaining owner in their store?
CREATE OR REPLACE FUNCTION public.is_last_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'owner'::app_role
      AND (
        SELECT count(*)
        FROM public.user_roles ur2
        WHERE ur2.role = 'owner'::app_role
          AND ur2.store_id = ur.store_id
      ) <= 1
  );
$$;

REVOKE ALL ON FUNCTION public.is_last_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_last_owner(uuid) TO authenticated, service_role;

-- 3) Helper: encode merchant employee-management hierarchy
--   owner   -> may manage anyone in their store except the last remaining owner
--   admin   -> may manage admin/manager/cashier (not owner)
--   manager -> may manage cashiers only, in the same store, and not themselves
CREATE OR REPLACE FUNCTION public.can_manage_employee(_actor uuid, _target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_store uuid;
  v_target_store uuid;
  v_actor_roles text[];
  v_target_roles text[];
BEGIN
  IF _actor IS NULL OR _target IS NULL THEN RETURN false; END IF;

  SELECT store_id INTO v_actor_store  FROM public.profiles WHERE id = _actor;
  SELECT store_id INTO v_target_store FROM public.profiles WHERE id = _target;
  IF v_actor_store IS NULL OR v_target_store IS NULL
     OR v_actor_store <> v_target_store THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_actor_roles FROM public.user_roles
    WHERE user_id = _actor AND store_id = v_actor_store;
  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_target_roles FROM public.user_roles
    WHERE user_id = _target AND store_id = v_target_store;

  -- Never allow anyone to manage a platform-staff account through this path.
  IF v_target_roles && ARRAY[
    'super_admin','operations_admin','support_admin','billing_admin','analyst',
    'technical_support','merchant_support','compliance_support','billing_support',
    'read_only_auditor'
  ] THEN
    RETURN false;
  END IF;

  IF 'owner' = ANY(v_actor_roles) THEN
    -- Owner may manage anyone but must not act on themselves for
    -- role/removal (checked at call site via is_last_owner).
    RETURN true;
  END IF;

  IF 'admin' = ANY(v_actor_roles) THEN
    -- Admin may manage admin/manager/cashier, not owner.
    RETURN NOT ('owner' = ANY(v_target_roles));
  END IF;

  IF 'manager' = ANY(v_actor_roles) THEN
    -- Manager may only touch cashiers (never themselves, another manager,
    -- an admin, or an owner).
    IF _actor = _target THEN RETURN false; END IF;
    RETURN NOT (
      'owner'   = ANY(v_target_roles)
      OR 'admin'   = ANY(v_target_roles)
      OR 'manager' = ANY(v_target_roles)
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(uuid, uuid) TO authenticated, service_role;

-- 4) Trigger guarding user_roles: never leave a store with zero owners.
CREATE OR REPLACE FUNCTION public.tg_user_roles_protect_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_user  uuid;
  v_remaining int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role::text <> 'owner' THEN RETURN OLD; END IF;
    v_store := OLD.store_id; v_user := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only care when demoting away from owner.
    IF OLD.role::text = 'owner' AND NEW.role::text <> 'owner' THEN
      v_store := OLD.store_id; v_user := OLD.user_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
    FROM public.user_roles
    WHERE store_id = v_store
      AND role = 'owner'::app_role
      AND user_id <> v_user;

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'Cannot demote or remove the last owner of this business';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.tg_user_roles_protect_last_owner()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_protect_last_owner ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_owner
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_protect_last_owner();