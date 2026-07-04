-- Tighten cross-tenant write policies to require the row's store_id matches the caller's store.

-- categories
DROP POLICY IF EXISTS "categories_modify" ON public.categories;
CREATE POLICY "categories_modify" ON public.categories
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- payment_terminals
DROP POLICY IF EXISTS "Managers can manage terminals" ON public.payment_terminals;
CREATE POLICY "Managers can manage terminals" ON public.payment_terminals
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  );

-- products
DROP POLICY IF EXISTS "products_modify" ON public.products;
CREATE POLICY "products_modify" ON public.products
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- sales (UPDATE only; add WITH CHECK)
DROP POLICY IF EXISTS "sales_update_mgmt" ON public.sales;
CREATE POLICY "sales_update_mgmt" ON public.sales
  FOR UPDATE
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- stores (row is the store itself — match by id)
DROP POLICY IF EXISTS "stores_modify" ON public.stores;
CREATE POLICY "stores_modify" ON public.stores
  FOR ALL
  USING (
    id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  );

-- user_roles
DROP POLICY IF EXISTS "user_roles_modify" ON public.user_roles;
CREATE POLICY "user_roles_modify" ON public.user_roles
  FOR ALL
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  );

-- audit_log: require store_id matches caller's store on insert
DROP POLICY IF EXISTS "Employees insert their own audit entries" ON public.audit_log;
CREATE POLICY "Employees insert their own audit entries" ON public.audit_log
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND store_id = public.current_store_id()
  );
