
-- Idempotency for offline-created sales & cash movements.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_idempotency_key_uidx
  ON public.sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS synced_from_offline boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS offline_created_at timestamptz;

ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_idempotency_key_uidx
  ON public.cash_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;
