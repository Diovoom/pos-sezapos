
-- Cash drawer control + shift close: extend register_sessions and cash_movements

-- register_sessions: closing snapshot fields
ALTER TABLE public.register_sessions
  ADD COLUMN IF NOT EXISTS safe_drop_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS close_notes text,
  ADD COLUMN IF NOT EXISTS denominations jsonb;

-- stores: shift-close prefs
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS starting_cash_float numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS show_expected_before_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variance_alert_threshold numeric NOT NULL DEFAULT 5;

-- cash_movements: allow safe_drop type
ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_type_check;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_type_check
  CHECK (type = ANY (ARRAY['payout'::text, 'deposit'::text, 'safe_drop'::text]));

-- Cashiers can insert safe drops linked to their own open session
CREATE POLICY "Cashiers insert safe drops for own open session"
ON public.cash_movements FOR INSERT TO authenticated
WITH CHECK (
  store_id = public.current_store_id()
  AND user_id = auth.uid()
  AND type = 'safe_drop'
  AND EXISTS (
    SELECT 1 FROM public.register_sessions rs
    WHERE rs.id = register_session_id
      AND rs.opened_by = auth.uid()
      AND rs.status = 'open'
  )
);
