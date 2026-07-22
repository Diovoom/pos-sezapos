REVOKE SELECT ON public.device_registrations FROM authenticated;
GRANT SELECT (
  id, store_id, label, platform, app_version, status, status_snapshot,
  paired_at, paired_by, last_seen_at, last_sync_at,
  revoked_at, revoked_by, revoke_reason, created_at, updated_at
) ON public.device_registrations TO authenticated;

DROP POLICY IF EXISTS "support_tickets_merchant_view" ON public.support_tickets;
CREATE POLICY "support_tickets_merchant_view" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    store_id IS NOT NULL
    AND store_id = public.current_store_id()
    AND (
      requester_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    )
  );