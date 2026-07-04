
DROP POLICY IF EXISTS "Managers and owners read all audit entries" ON public.audit_log;
CREATE POLICY "Managers and owners read all audit entries" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    AND store_id = public.current_store_id()
  );

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
      AND store_id = public.current_store_id()
    )
  );

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
      AND store_id = public.current_store_id()
    )
  );
