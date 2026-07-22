
-- Admin operations: support tickets, admin support sessions, admin-scoped columns and read policies for super_admin.

-- 1. Extend stores with admin-only fields
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 2. Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigserial UNIQUE NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_email text,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_store_idx ON public.support_tickets(store_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON public.support_tickets(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.support_tickets_ticket_number_seq TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT ALL ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_super_admin_all" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "support_tickets_merchant_view" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND store_id = public.current_store_id());

DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Support ticket notes
CREATE TABLE IF NOT EXISTS public.support_ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email text,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket_idx ON public.support_ticket_notes(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_notes TO authenticated;
GRANT ALL ON public.support_ticket_notes TO service_role;

ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_notes_super_admin_all" ON public.support_ticket_notes
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. Admin support sessions (support view audit)
CREATE TABLE IF NOT EXISTS public.admin_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS admin_support_sessions_admin_idx ON public.admin_support_sessions(admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_support_sessions_store_idx ON public.admin_support_sessions(store_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.admin_support_sessions TO authenticated;
GRANT ALL ON public.admin_support_sessions TO service_role;

ALTER TABLE public.admin_support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_support_sessions_super_admin_all" ON public.admin_support_sessions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. Super admin cross-store read policies for merchant tables
-- (additive: existing per-store policies remain in force for merchant users)

CREATE POLICY "stores_super_admin_select" ON public.stores
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "stores_super_admin_update" ON public.stores
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "profiles_super_admin_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "profiles_super_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "subscriptions_super_admin_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "payment_terminals_super_admin_all" ON public.payment_terminals
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "register_sessions_super_admin_select" ON public.register_sessions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "sales_super_admin_select" ON public.sales
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "refunds_super_admin_select" ON public.refunds
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "payment_attempts_super_admin_select" ON public.payment_attempts
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "audit_log_super_admin_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "cash_movements_super_admin_select" ON public.cash_movements
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "time_entries_super_admin_select" ON public.time_entries
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles_super_admin_modify" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 6. Helper: search entities globally for super_admin
CREATE OR REPLACE FUNCTION public.admin_global_search(_q text, _limit int DEFAULT 25)
RETURNS TABLE(kind text, id uuid, store_id uuid, label text, sublabel text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := lower(coalesce(_q, ''));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'store'::text, s.id, s.id,
           s.name,
           coalesce(s.email, s.store_code, s.city, '')::text
    FROM public.stores s
    WHERE lower(s.name) LIKE '%'||q||'%'
       OR lower(coalesce(s.store_code,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.phone,'')) LIKE '%'||q||'%'
       OR s.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'owner'::text, p.id, p.store_id,
           coalesce(p.full_name, p.email, '(no name)')::text,
           coalesce(p.email, p.phone, '')::text
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('owner'::app_role, 'admin'::app_role)
    WHERE lower(coalesce(p.full_name,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.phone,'')) LIKE '%'||q||'%'
       OR p.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'terminal'::text, t.id, t.store_id,
           t.label,
           coalesce(t.serial, t.provider, '')::text
    FROM public.payment_terminals t
    WHERE lower(t.label) LIKE '%'||q||'%'
       OR lower(coalesce(t.serial,'')) LIKE '%'||q||'%'
       OR t.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'subscription'::text, sub.id, sub.store_id,
           coalesce(sub.stripe_subscription_id, sub.id::text),
           coalesce(sub.status, '')::text
    FROM public.subscriptions sub
    WHERE lower(coalesce(sub.stripe_subscription_id,'')) LIKE '%'||q||'%'
       OR lower(coalesce(sub.stripe_customer_id,'')) LIKE '%'||q||'%'
       OR sub.id::text = q
    LIMIT _limit;
END $$;

REVOKE ALL ON FUNCTION public.admin_global_search(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_global_search(text, int) TO authenticated;
