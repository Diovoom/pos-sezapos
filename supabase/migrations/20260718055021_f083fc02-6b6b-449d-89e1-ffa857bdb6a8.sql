
ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_note text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now();

UPDATE public.admin_support_sessions
   SET status = CASE WHEN ended_at IS NOT NULL THEN 'ended' ELSE 'active' END,
       decided_at = COALESCE(decided_at, started_at)
 WHERE status = 'pending' AND started_at IS NOT NULL;

ALTER TABLE public.admin_support_sessions
  DROP CONSTRAINT IF EXISTS admin_support_sessions_status_check;
ALTER TABLE public.admin_support_sessions
  ADD CONSTRAINT admin_support_sessions_status_check
  CHECK (status IN ('pending', 'active', 'declined', 'ended', 'expired'));

CREATE INDEX IF NOT EXISTS admin_support_sessions_store_status_idx
  ON public.admin_support_sessions (store_id, status)
  WHERE status IN ('pending', 'active');

DROP POLICY IF EXISTS "admin_support_sessions_merchant_read" ON public.admin_support_sessions;
CREATE POLICY "admin_support_sessions_merchant_read"
  ON public.admin_support_sessions
  FOR SELECT
  TO authenticated
  USING (store_id = public.current_store_id());

DROP POLICY IF EXISTS "admin_support_sessions_merchant_respond" ON public.admin_support_sessions;
CREATE POLICY "admin_support_sessions_merchant_respond"
  ON public.admin_support_sessions
  FOR UPDATE
  TO authenticated
  USING (store_id = public.current_store_id() AND status IN ('pending', 'active'))
  WITH CHECK (store_id = public.current_store_id() AND status IN ('active', 'declined', 'ended'));

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_support_sessions';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.admin_support_sessions REPLICA IDENTITY FULL;
