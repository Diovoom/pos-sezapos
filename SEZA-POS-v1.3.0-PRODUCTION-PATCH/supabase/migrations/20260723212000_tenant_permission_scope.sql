-- Prevent a role assigned in one merchant store from granting permissions in
-- another store selected by the same user profile/session.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND ur.store_id = public.current_store_id()
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
