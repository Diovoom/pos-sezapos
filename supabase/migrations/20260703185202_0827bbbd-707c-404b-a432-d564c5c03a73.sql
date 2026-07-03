
-- 1) Scope has_any_role() to caller's current store
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('owner'::app_role, 'admin'::app_role)
          AND store_id = public.current_store_id()
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = ANY(_roles)
        AND store_id = public.current_store_id()
    )
    ELSE false
  END
$function$;

-- 2) age_verifications insert: enforce store scope
DROP POLICY IF EXISTS "Cashiers can insert their own age verifications" ON public.age_verifications;
CREATE POLICY "Cashiers can insert their own age verifications"
  ON public.age_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND store_id = public.current_store_id()
  );

-- 3) sales insert: enforce store scope
DROP POLICY IF EXISTS "sales_insert" ON public.sales;
CREATE POLICY "sales_insert"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND store_id = public.current_store_id()
  );

-- 4) payment_attempts insert: enforce store scope
DROP POLICY IF EXISTS "staff can insert payment attempts" ON public.payment_attempts;
CREATE POLICY "staff can insert payment attempts"
  ON public.payment_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (attempted_by IS NULL OR attempted_by = auth.uid())
    AND store_id = public.current_store_id()
  );

-- 5) time_entries insert: enforce store scope
DROP POLICY IF EXISTS "self insert time entries" ON public.time_entries;
CREATE POLICY "self insert time entries"
  ON public.time_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND store_id = public.current_store_id()
  );

-- 6) register_sessions update: add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "Owner/opener can update register sessions" ON public.register_sessions;
CREATE POLICY "Owner/opener can update register sessions"
  ON public.register_sessions
  FOR UPDATE
  TO authenticated
  USING (
    opened_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND (
      opened_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    )
  );

-- 7) Revoke EXECUTE on the test-only SECURITY DEFINER helper from signed-in users
REVOKE EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) FROM PUBLIC, anon, authenticated;
