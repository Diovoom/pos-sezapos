DROP POLICY IF EXISTS ticket_notes_merchant_insert ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_insert
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.store_id = public.current_store_id()
    )
  );

DROP POLICY IF EXISTS support_tickets_merchant_update ON public.support_tickets;
CREATE POLICY support_tickets_merchant_update
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (store_id = public.current_store_id())
  WITH CHECK (store_id = public.current_store_id());