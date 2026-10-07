-- New investigation metadata only. Existing cases are deliberately not backfilled
-- with guessed times; the Admin reads their existing audit history when available.
ALTER TABLE public.support_tickets
  ADD COLUMN investigation_started_at timestamptz,
  ADD COLUMN investigation_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- The server already permits these roles to handle support. Their browser
-- Realtime subscriptions also need SELECT access; billing/analyst/merchant
-- roles keep their existing permissions. No merchant write policy is changed.
CREATE POLICY support_tickets_support_staff_read ON public.support_tickets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role::text IN ('operations_admin', 'support_admin')
  ));
CREATE POLICY support_ticket_notes_support_staff_read ON public.support_ticket_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role::text IN ('operations_admin', 'support_admin')
  ));

-- Admin clients use this table for case-specific screen-share state updates.
-- Restrict Realtime row visibility to the same support staff roles as the API.
CREATE POLICY admin_support_sessions_support_staff_read ON public.admin_support_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role::text IN ('super_admin', 'operations_admin', 'support_admin')
  ));
