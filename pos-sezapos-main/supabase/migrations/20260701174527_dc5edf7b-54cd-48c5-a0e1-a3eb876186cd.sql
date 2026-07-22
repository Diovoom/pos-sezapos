
-- Register sessions
CREATE TABLE public.register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  terminal_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  expected_cash numeric,
  cash_sales numeric NOT NULL DEFAULT 0,
  cash_refunds numeric NOT NULL DEFAULT 0,
  variance numeric,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.register_sessions TO authenticated;
GRANT ALL ON public.register_sessions TO service_role;

ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view store register sessions"
  ON public.register_sessions FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can open register sessions"
  ON public.register_sessions FOR INSERT TO authenticated
  WITH CHECK (opened_by = auth.uid() AND store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Owner/opener can update register sessions"
  ON public.register_sessions FOR UPDATE TO authenticated
  USING (opened_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::app_role[]));

CREATE TRIGGER register_sessions_updated_at
  BEFORE UPDATE ON public.register_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payment terminals
CREATE TABLE public.payment_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'manual',
  serial text,
  location text,
  status text NOT NULL DEFAULT 'inactive',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_terminals TO authenticated;
GRANT ALL ON public.payment_terminals TO service_role;

ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view store terminals"
  ON public.payment_terminals FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers can manage terminals"
  ON public.payment_terminals FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::app_role[]));

CREATE TRIGGER payment_terminals_updated_at
  BEFORE UPDATE ON public.payment_terminals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Link sales to register sessions
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS register_session_id uuid REFERENCES public.register_sessions(id);
CREATE INDEX IF NOT EXISTS sales_register_session_id_idx ON public.sales(register_session_id);
