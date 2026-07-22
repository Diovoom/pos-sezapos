-- Scope cross-tenant policies to current store

DROP POLICY IF EXISTS "Owner/opener can update register sessions" ON public.register_sessions;
CREATE POLICY "Owner/opener can update register sessions"
ON public.register_sessions
FOR UPDATE
USING (
  store_id = public.current_store_id()
  AND (
    opened_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
)
WITH CHECK (
  store_id = public.current_store_id()
  AND (
    opened_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
  )
);

DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries"
ON public.time_entries
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  )
);