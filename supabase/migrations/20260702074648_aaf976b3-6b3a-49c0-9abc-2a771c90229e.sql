
-- Helper: current user's store_id
CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT store_id FROM public.profiles WHERE id = auth.uid() $$;

REVOKE EXECUTE ON FUNCTION public.current_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated;

-- ============ RLS tightening ============

-- products
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- sales
DROP POLICY IF EXISTS sales_select ON public.sales;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- sale_items via join
DROP POLICY IF EXISTS sale_items_select ON public.sale_items;
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.store_id = public.current_store_id()));

-- refunds
DROP POLICY IF EXISTS "refunds readable by store users" ON public.refunds;
CREATE POLICY "refunds readable by store users" ON public.refunds FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- refund_items via join
DROP POLICY IF EXISTS "refund_items readable" ON public.refund_items;
CREATE POLICY "refund_items readable" ON public.refund_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.refunds r WHERE r.id = refund_items.refund_id AND r.store_id = public.current_store_id()));

-- categories
DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- stores
DROP POLICY IF EXISTS stores_select ON public.stores;
CREATE POLICY stores_select ON public.stores FOR SELECT TO authenticated
  USING (id = public.current_store_id());

-- age_verifications
DROP POLICY IF EXISTS "Staff can read age verifications" ON public.age_verifications;
CREATE POLICY "Staff can read age verifications" ON public.age_verifications FOR SELECT TO authenticated
  USING (store_id = public.current_store_id());

-- payment_attempts: remove NULL bypass
DROP POLICY IF EXISTS "staff can read payment attempts" ON public.payment_attempts;
CREATE POLICY "staff can read payment attempts" ON public.payment_attempts FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND store_id = public.current_store_id());

-- role_permissions: restrict to management
DROP POLICY IF EXISTS "Anyone signed in can read role permissions" ON public.role_permissions;
CREATE POLICY "Management can read role permissions" ON public.role_permissions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role]));

-- ============ Storage policies ============

-- Avatars: restrict reads to same-store staff or owner of file
DROP POLICY IF EXISTS avatars_read ON storage.objects;
CREATE POLICY avatars_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.store_id = (
            SELECT p2.store_id FROM public.profiles p2 WHERE p2.id = storage.objects.owner
          )
      )
    )
  );

-- product-images write: restrict to management of same store; path convention: <store_id>/<file>
DROP POLICY IF EXISTS "product-images authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "product-images public read" ON storage.objects;

CREATE POLICY "product-images read same store" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images' AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.store_id = (SELECT p2.store_id FROM public.profiles p2 WHERE p2.id = storage.objects.owner)
      )
    )
  );

CREATE POLICY "product-images insert same store" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );

CREATE POLICY "product-images update same store" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND owner = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );

CREATE POLICY "product-images delete same store" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND owner = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );

-- ============ Function search_path & EXECUTE grants ============

ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_assign_receipt_number() SET search_path = public;

-- Revoke EXECUTE on internal-only SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_store_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_for_employee_id(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_time_entries_compute_late() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_restock_on_refund() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_update_sale_refund_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;

-- Keep has_role/has_any_role/has_permission/has_active_plan/is_read_only/current_store_id executable by authenticated (used by RLS)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_plan(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_read_only(uuid) FROM PUBLIC, anon;
