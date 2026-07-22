-- Fix 1: Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_protect_super_admin_role() FROM PUBLIC, anon;

-- Fix 2: Recreate policies scoped to `authenticated` role only

-- audit_log
DROP POLICY IF EXISTS "Employees insert their own audit entries" ON public.audit_log;
CREATE POLICY "Employees insert their own audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK ((actor_id = auth.uid()) AND (store_id = public.current_store_id()));

-- categories
DROP POLICY IF EXISTS categories_modify ON public.categories;
CREATE POLICY categories_modify
  ON public.categories FOR ALL TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- products
DROP POLICY IF EXISTS products_modify ON public.products;
CREATE POLICY products_modify
  ON public.products FOR ALL TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- register_sessions
DROP POLICY IF EXISTS "Owner/opener can update register sessions" ON public.register_sessions;
CREATE POLICY "Owner/opener can update register sessions"
  ON public.register_sessions FOR UPDATE TO authenticated
  USING ((store_id = public.current_store_id()) AND ((opened_by = auth.uid()) OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK ((store_id = public.current_store_id()) AND ((opened_by = auth.uid()) OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

-- sales
DROP POLICY IF EXISTS sales_update_mgmt ON public.sales;
CREATE POLICY sales_update_mgmt
  ON public.sales FOR UPDATE TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- stores
DROP POLICY IF EXISTS stores_modify ON public.stores;
CREATE POLICY stores_modify
  ON public.stores FOR ALL TO authenticated
  USING ((id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))
  WITH CHECK ((id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]));

-- user_roles
DROP POLICY IF EXISTS user_roles_modify ON public.user_roles;
CREATE POLICY user_roles_modify
  ON public.user_roles FOR ALL TO authenticated
  USING ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]))
  WITH CHECK ((store_id = public.current_store_id()) AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));