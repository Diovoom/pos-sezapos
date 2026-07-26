BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS chat_status text DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_merchant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ended_at timestamptz;

ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_guest_token_hash_idx
  ON public.support_tickets (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_public_chat_queue_idx
  ON public.support_tickets (source, chat_status, last_message_at DESC)
  WHERE source = 'website_live_chat';

UPDATE public.support_ticket_notes
SET sender_kind = CASE WHEN author_id IS NULL THEN 'visitor' ELSE 'admin' END
WHERE sender_kind IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
