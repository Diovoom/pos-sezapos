-- Normalize production support/admin state after deployments where the UI
-- reached production before every July support migration.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'global',
  company_name text NOT NULL DEFAULT 'SEZA POS',
  support_email text NOT NULL DEFAULT 'support@sezapos.com',
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com',
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com',
  timezone text NOT NULL DEFAULT 'America/New_York',
  default_trial_days integer NOT NULL DEFAULT 14 CHECK (default_trial_days BETWEEN 1 AND 90),
  support_sla_minutes integer NOT NULL DEFAULT 60 CHECK (support_sla_minutes BETWEEN 5 AND 10080),
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS resolution_code text;

UPDATE public.support_tickets
SET
  chat_status = CASE
    WHEN status IN ('resolved', 'closed') THEN 'ended'
    WHEN chat_status = 'ended' THEN 'active'
    ELSE COALESCE(chat_status, 'waiting')
  END,
  priority = CASE WHEN status IN ('resolved', 'closed') THEN 'normal' ELSE priority END,
  last_message_at = COALESCE(last_message_at, updated_at, created_at),
  chat_ended_at = CASE
    WHEN status IN ('resolved', 'closed') THEN COALESCE(chat_ended_at, resolved_at, closed_at, updated_at)
    ELSE NULL
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_tickets_chat_status_check'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_chat_status_check
      CHECK (chat_status IN ('waiting', 'active', 'ended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS support_tickets_chat_activity_idx
  ON public.support_tickets(chat_status, last_message_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'support_tickets'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'support_ticket_notes'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
  END IF;
END $$;
