
CREATE TABLE public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  register_session_id UUID NOT NULL REFERENCES public.register_sessions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('payout','deposit')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cash_movements_session_idx ON public.cash_movements(register_session_id);
CREATE INDEX cash_movements_store_idx ON public.cash_movements(store_id, created_at DESC);

GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members read cash movements"
  ON public.cash_movements FOR SELECT
  TO authenticated
  USING (store_id = public.current_store_id());

CREATE POLICY "Store members insert cash movements"
  ON public.cash_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id = public.current_store_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "Owners and admins delete cash movements"
  ON public.cash_movements FOR DELETE
  TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  );
