
-- Scope payment_terminals policy to authenticated
DROP POLICY IF EXISTS "Managers can manage terminals" ON public.payment_terminals;
CREATE POLICY "Managers can manage terminals" ON public.payment_terminals
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))
  WITH CHECK ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]));

-- Scope time_entries select policy to authenticated
DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries" ON public.time_entries
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

-- Prevent store admins/owners from assigning super_admin via user_roles_modify
DROP POLICY IF EXISTS user_roles_modify ON public.user_roles;
CREATE POLICY user_roles_modify ON public.user_roles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (store_id = current_store_id())
    AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    AND role <> 'super_admin'::app_role
  )
  WITH CHECK (
    (store_id = current_store_id())
    AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    AND role <> 'super_admin'::app_role
  );
