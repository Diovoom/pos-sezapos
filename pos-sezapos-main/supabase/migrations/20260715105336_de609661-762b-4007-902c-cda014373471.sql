DROP POLICY IF EXISTS "Staff can view store terminals" ON public.payment_terminals;
CREATE POLICY "Managers can view store terminals" ON public.payment_terminals
  FOR SELECT TO authenticated
  USING (store_id = current_store_id() AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]));