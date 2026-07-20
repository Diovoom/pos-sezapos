-- Tighten support ticket RLS: notes insert requires active same-store employee;
-- ticket updates go through a SECURITY DEFINER RPC that enforces role/requester
-- checks and restricts writable columns.

DROP POLICY IF EXISTS ticket_notes_merchant_insert ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_insert
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND internal = false
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.store_id = public.current_store_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.store_id = public.current_store_id()
        AND t.status NOT IN ('closed')
    )
  );

-- Merchants no longer update support_tickets directly.
DROP POLICY IF EXISTS support_tickets_merchant_update ON public.support_tickets;

CREATE OR REPLACE FUNCTION public.merchant_update_support_ticket(
  _ticket_id uuid,
  _status text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _subject text DEFAULT NULL
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_active boolean;
  v_ticket public.support_tickets;
  v_is_priv boolean;
  v_is_requester boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT store_id, (status = 'active') INTO v_store, v_active
    FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_active, false) OR v_store IS NULL THEN
    RAISE EXCEPTION 'Inactive or unassigned employee' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND OR v_ticket.store_id IS DISTINCT FROM v_store THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = '42501';
  END IF;

  v_is_requester := (v_ticket.requester_id = v_uid);
  v_is_priv :=
    public.has_any_role(v_uid, ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    OR public.has_permission(v_uid, 'support.manage');

  IF NOT (v_is_requester OR v_is_priv) THEN
    RAISE EXCEPTION 'Not permitted to modify this ticket' USING ERRCODE = '42501';
  END IF;

  -- Cashiers (non-privileged requesters) may not reassign priority.
  IF _priority IS NOT NULL AND NOT v_is_priv THEN
    RAISE EXCEPTION 'Not permitted to change priority' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('open','waiting_support','waiting_for_merchant','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;

  IF _priority IS NOT NULL AND _priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority' USING ERRCODE = '22023';
  END IF;

  UPDATE public.support_tickets
     SET status     = COALESCE(_status, status),
         priority   = COALESCE(_priority, priority),
         subject    = COALESCE(NULLIF(btrim(_subject), ''), subject),
         updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_ticket;

  RETURN v_ticket;
END
$$;

REVOKE ALL ON FUNCTION public.merchant_update_support_ticket(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_update_support_ticket(uuid, text, text, text) TO authenticated;