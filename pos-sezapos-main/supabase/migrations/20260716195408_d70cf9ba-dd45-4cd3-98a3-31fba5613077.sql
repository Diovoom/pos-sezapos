-- 1) Add new enum value (IF NOT EXISTS is idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) Helper function: is the user a platform super admin?
-- Uses text comparison so it works even in the same tx that adds the enum value.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- 3) Protect super_admin role assignments from being created/modified/deleted
-- by anyone other than an existing super_admin (or the service_role).
CREATE OR REPLACE FUNCTION public.tg_protect_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_touches_super boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_super := (NEW.role::text = 'super_admin');
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_super := (NEW.role::text = 'super_admin' OR OLD.role::text = 'super_admin');
  ELSIF TG_OP = 'DELETE' THEN
    v_touches_super := (OLD.role::text = 'super_admin');
  END IF;

  IF v_touches_super THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform super admins can manage the super_admin role';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_super_admin_role();

-- 4) Let super admins read all role assignments (for the admin console).
DROP POLICY IF EXISTS "super_admin_select_all_user_roles" ON public.user_roles;
CREATE POLICY "super_admin_select_all_user_roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
