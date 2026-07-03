
-- sale_items: add store binding on insert
DROP POLICY IF EXISTS "sale_items_insert" ON public.sale_items;
CREATE POLICY "sale_items_insert" ON public.sale_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.id = sale_items.sale_id
       AND s.cashier_id = auth.uid()
       AND s.store_id = public.current_store_id()
  )
);

-- refunds: constrain to same store and to an existing sale in that store
DROP POLICY IF EXISTS "refunds insert by staff" ON public.refunds;
CREATE POLICY "refunds insert by staff" ON public.refunds
FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','cashier']::app_role[])
  AND store_id = public.current_store_id()
  AND EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.id = refunds.sale_id
       AND s.store_id = public.current_store_id()
  )
);

-- refund_items: constrain to a refund in current store
DROP POLICY IF EXISTS "refund_items insert by staff" ON public.refund_items;
CREATE POLICY "refund_items insert by staff" ON public.refund_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['owner','admin','manager','cashier']::app_role[])
  AND EXISTS (
    SELECT 1 FROM public.refunds r
     WHERE r.id = refund_items.refund_id
       AND r.store_id = public.current_store_id()
  )
);

-- sms_send_log: add store-scoped insert/update policies for authenticated staff
CREATE POLICY "sms_send_log_insert_store" ON public.sms_send_log
FOR INSERT TO authenticated
WITH CHECK (store_id = public.current_store_id());

CREATE POLICY "sms_send_log_update_store" ON public.sms_send_log
FOR UPDATE TO authenticated
USING (store_id = public.current_store_id())
WITH CHECK (store_id = public.current_store_id());
