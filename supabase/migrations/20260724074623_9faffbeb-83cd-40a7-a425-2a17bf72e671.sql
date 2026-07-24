DROP POLICY IF EXISTS ticket_notes_merchant_view ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_view ON public.support_ticket_notes
FOR SELECT
USING (
  internal = false
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_notes.ticket_id
      AND t.store_id = public.current_store_id()
  )
);