BEGIN;

ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS setup_source text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  store_id uuid,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  verification_method text,
  success boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_step_up_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  store_id uuid,
  user_id uuid NOT NULL,
  purpose text NOT NULL,
  method text NOT NULL,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_step_up_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_security_events_owner_read
ON public.payment_security_events;

CREATE POLICY payment_security_events_owner_read
ON public.payment_security_events
FOR SELECT
TO authenticated
USING (
  actor_user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS payment_step_up_sessions_self
ON public.payment_step_up_sessions;

CREATE POLICY payment_step_up_sessions_self
ON public.payment_step_up_sessions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS payment_step_up_sessions_user_expires_idx
ON public.payment_step_up_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS payment_security_events_actor_created_idx
ON public.payment_security_events (actor_user_id, created_at DESC);

COMMENT ON TABLE public.payment_step_up_sessions IS
'Short-lived owner verification records for payout, processor credential, and terminal configuration changes. Never stores bank account numbers or one-time codes.';

NOTIFY pgrst, 'reload schema';

COMMIT;