
-- Prevent duplicate open shifts per user
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_user
  ON public.time_entries (user_id)
  WHERE clock_out IS NULL;

-- Managers should also be able to see everyone's shifts
DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries"
  ON public.time_entries FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  );
