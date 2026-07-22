
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  attempted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text,
  method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL,
  message text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read payment attempts"
  ON public.payment_attempts FOR SELECT
  TO authenticated
  USING (
    store_id IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.store_id = payment_attempts.store_id)
  );

CREATE POLICY "staff can insert payment attempts"
  ON public.payment_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    attempted_by IS NULL OR attempted_by = auth.uid()
  );

CREATE INDEX payment_attempts_created_at_idx ON public.payment_attempts (created_at DESC);
