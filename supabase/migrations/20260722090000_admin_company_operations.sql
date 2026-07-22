-- ============================================================================
-- SEZA Platform Operations correction
-- Company staff, merchant billing, support lifecycle, and live communications
-- Additive and idempotent.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. SEZA company staff metadata
-- --------------------------------------------------------------------------
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

GRANT ALL ON public.admin_staff_profiles TO service_role;
ALTER TABLE public.admin_staff_profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS admin_staff_profiles_updated_at ON public.admin_staff_profiles;
CREATE TRIGGER admin_staff_profiles_updated_at
  BEFORE UPDATE ON public.admin_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed the real founder record only when the existing account is present.
INSERT INTO public.admin_staff_profiles (user_id, title, department, employment_status, started_on)
SELECT p.id, 'Founder & CEO', 'Executive', 'active', CURRENT_DATE
FROM public.profiles p
WHERE lower(p.email) = 'admin@sezapos.com'
ON CONFLICT (user_id) DO UPDATE
SET title = 'Founder & CEO',
    department = 'Executive',
    employment_status = 'active';

-- --------------------------------------------------------------------------
-- 2. Platform settings (one global row)
-- --------------------------------------------------------------------------
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

GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- --------------------------------------------------------------------------
-- 3. Professional support lifecycle and persistent live chat
-- --------------------------------------------------------------------------
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
  ADD COLUMN IF NOT EXISTS device_registration_id uuid REFERENCES public.device_registrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_admin_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_tickets_chat_status_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_chat_status_check
      CHECK (chat_status IN ('waiting','active','ended'));
  END IF;
END $$;

-- Normalize the older label used by the first support implementation.
UPDATE public.support_tickets
SET status = 'investigating'
WHERE status = 'waiting_support';

UPDATE public.support_tickets
SET resolution_summary = COALESCE(resolution_summary, resolution),
    last_message_at = COALESCE(
      last_message_at,
      (SELECT max(n.created_at) FROM public.support_ticket_notes n WHERE n.ticket_id = support_tickets.id),
      updated_at
    ),
    chat_status = CASE
      WHEN chat_ended_at IS NOT NULL THEN 'ended'
      WHEN status IN ('resolved','closed') AND chat_status = 'waiting' THEN 'ended'
      ELSE chat_status
    END;

CREATE INDEX IF NOT EXISTS support_tickets_active_work_idx
  ON public.support_tickets(status, assigned_admin_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_chat_idx
  ON public.support_tickets(chat_status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_device_idx
  ON public.support_tickets(device_registration_id);

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

-- Keep a permanent creation event for both old and new cases.
INSERT INTO public.support_ticket_events (
  ticket_id, actor_id, actor_email, event_type, from_status, to_status, details, created_at
)
SELECT
  t.id, t.requester_id, t.requester_email, 'created', NULL, t.status,
  jsonb_build_object('subject', t.subject, 'priority', t.priority), t.created_at
FROM public.support_tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_ticket_events e
  WHERE e.ticket_id = t.id AND e.event_type = 'created'
);

CREATE OR REPLACE FUNCTION public.tg_support_ticket_created_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.support_ticket_events (
    ticket_id, actor_id, actor_email, event_type, from_status, to_status, details, created_at
  ) VALUES (
    NEW.id, NEW.requester_id, NEW.requester_email, 'created', NULL, NEW.status,
    jsonb_build_object('subject', NEW.subject, 'priority', NEW.priority), NEW.created_at
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_ticket_created_event ON public.support_tickets;
CREATE TRIGGER support_ticket_created_event
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_created_event();

GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- Platform staff may subscribe to tickets and messages with their isolated
-- admin session. Writes still go through audited server functions.
DROP POLICY IF EXISTS support_tickets_platform_staff_select ON public.support_tickets;
CREATE POLICY support_tickets_platform_staff_select
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS support_ticket_notes_platform_staff_select ON public.support_ticket_notes;
CREATE POLICY support_ticket_notes_platform_staff_select
  ON public.support_ticket_notes FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

-- Never expose internal notes to merchants.
DROP POLICY IF EXISTS ticket_notes_merchant_view ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_view
  ON public.support_ticket_notes FOR SELECT TO authenticated
  USING (
    internal = false
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.store_id = public.current_store_id()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_support_note_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NEW.created_at,
      updated_at = now(),
      chat_status = CASE WHEN NEW.internal THEN chat_status ELSE 'active' END,
      chat_ended_at = CASE WHEN NEW.internal THEN chat_ended_at ELSE NULL END,
      chat_ended_by = CASE WHEN NEW.internal THEN chat_ended_by ELSE NULL END,
      status = CASE WHEN NOT NEW.internal AND status = 'resolved' THEN 'open' ELSE status END,
      resolved_at = CASE WHEN NOT NEW.internal AND status = 'resolved' THEN NULL ELSE resolved_at END,
      closed_at = CASE WHEN NOT NEW.internal AND status = 'resolved' THEN NULL ELSE closed_at END,
      first_response_at = CASE
        WHEN first_response_at IS NULL
         AND NEW.author_id IS NOT NULL
         AND public.is_platform_staff(NEW.author_id)
        THEN NEW.created_at
        ELSE first_response_at
      END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_note_activity ON public.support_ticket_notes;
CREATE TRIGGER support_note_activity
  AFTER INSERT ON public.support_ticket_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_note_activity();


-- Merchant read receipts for the live support thread.
CREATE OR REPLACE FUNCTION public.merchant_mark_support_read(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store
  FROM public.profiles
  WHERE id = auth.uid() AND status = 'active';

  IF v_store IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = _ticket_id AND store_id = v_store
  ) THEN
    RAISE EXCEPTION 'Support case not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_tickets
  SET last_merchant_read_at = now()
  WHERE id = _ticket_id;
END
$$;

REVOKE ALL ON FUNCTION public.merchant_mark_support_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_mark_support_read(uuid) TO authenticated;

-- Realtime for support chat. Avoid duplicate publication membership.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_ticket_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 4. Merchant-to-SEZA subscription payment ledger
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE,
  stripe_invoice_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  status text NOT NULL,
  amount_due_cents bigint NOT NULL DEFAULT 0,
  amount_paid_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  billing_reason text,
  hosted_invoice_url text,
  invoice_pdf_url text,
  failure_message text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_billing_payments_store_idx
  ON public.merchant_billing_payments(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS merchant_billing_payments_status_idx
  ON public.merchant_billing_payments(status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS merchant_billing_payments_subscription_idx
  ON public.merchant_billing_payments(stripe_subscription_id);

GRANT ALL ON public.merchant_billing_payments TO service_role;
ALTER TABLE public.merchant_billing_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS merchant_billing_payments_updated_at ON public.merchant_billing_payments;
CREATE TRIGGER merchant_billing_payments_updated_at
  BEFORE UPDATE ON public.merchant_billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
