-- Merchant-side close action for authenticated SEZA support cases.
-- Cashiers may close only cases they opened; owner/admin/manager may close any case for their store.
CREATE OR REPLACE FUNCTION public.merchant_close_support_case(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_requester_id uuid;
  v_resolution text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT store_id
    INTO v_store_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND status = 'active';

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No active store context' USING ERRCODE = '42501';
  END IF;

  SELECT requester_id,
         COALESCE(NULLIF(resolution_summary, ''), NULLIF(resolution, ''),
                  'Closed by merchant after the issue was completed.')
    INTO v_requester_id, v_resolution
  FROM public.support_tickets
  WHERE id = _ticket_id
    AND store_id = v_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support case not found' USING ERRCODE = '42501';
  END IF;

  IF v_requester_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_any_role(
       auth.uid(),
       ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
     ) THEN
    RAISE EXCEPTION 'You cannot close this support case' USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_tickets
  SET status = 'closed',
      resolution_summary = v_resolution,
      resolution = v_resolution,
      resolution_code = COALESCE(NULLIF(resolution_code, ''), 'merchant_closed'),
      resolved_at = COALESCE(resolved_at, now()),
      closed_at = now(),
      chat_status = 'ended',
      chat_ended_at = now(),
      chat_ended_by = auth.uid(),
      priority = 'normal',
      updated_at = now()
  WHERE id = _ticket_id;
END
$$;

REVOKE ALL ON FUNCTION public.merchant_close_support_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_close_support_case(uuid) TO authenticated;
