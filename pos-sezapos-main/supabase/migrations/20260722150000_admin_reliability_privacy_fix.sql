-- SEZA Admin reliability + privacy correction
-- Idempotent. Safe to apply after earlier Admin migrations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.admin_staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  department text NOT NULL DEFAULT 'Operations',
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('invited','active','inactive')),
  phone text,
  started_on date,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

GRANT ALL ON public.admin_staff_profiles TO service_role;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.admin_staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_staff_profiles (
  user_id, title, department, employment_status, phone, started_on
)
SELECT
  profile.id,
  'Founder & CEO',
  'Executive',
  'active',
  profile.phone,
  COALESCE(profile.created_at::date, CURRENT_DATE)
FROM public.profiles profile
WHERE lower(profile.email) = 'admin@sezapos.com'
ON CONFLICT (user_id) DO UPDATE
SET title = 'Founder & CEO',
    department = 'Executive',
    employment_status = 'active',
    phone = COALESCE(EXCLUDED.phone, public.admin_staff_profiles.phone),
    updated_at = now();

-- Support lifecycle columns required by Resolve / Close / live chat.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz;

ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'merchant';

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON public.support_ticket_events(ticket_id, created_at);

GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST immediately so newly created tables stop returning
-- "Could not find the table in the schema cache" after db push.
NOTIFY pgrst, 'reload schema';
