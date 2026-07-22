
-- 1) Restrict age_verifications SELECT to managers/admins/owners only
DROP POLICY IF EXISTS "Staff can read age verifications" ON public.age_verifications;
CREATE POLICY "Managers can read age verifications"
  ON public.age_verifications
  FOR SELECT
  TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  );

-- 2) Revoke direct EXECUTE on has_role from client roles.
-- has_role is not referenced by any RLS policy; app code now uses has_any_role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
