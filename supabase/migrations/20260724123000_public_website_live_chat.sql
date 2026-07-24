-- Public website live chat support.
-- Visitors are authenticated with a random opaque token that is only stored
-- in the browser session. The database stores a SHA-256 hash of that token.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_guest_token_hash_idx
  ON public.support_tickets (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_website_chat_activity_idx
  ON public.support_tickets (source, chat_status, last_message_at DESC)
  WHERE source = 'website_live_chat';

CREATE INDEX IF NOT EXISTS support_tickets_visitor_ip_rate_idx
  ON public.support_tickets (visitor_ip_hash, created_at DESC)
  WHERE source = 'website_live_chat' AND visitor_ip_hash IS NOT NULL;

COMMENT ON COLUMN public.support_tickets.visitor_name IS
  'Name supplied by an unauthenticated public website live-chat visitor.';
COMMENT ON COLUMN public.support_tickets.visitor_phone IS
  'Phone supplied by an unauthenticated public website live-chat visitor.';
COMMENT ON COLUMN public.support_tickets.guest_token_hash IS
  'SHA-256 hash of the opaque browser chat token; the plaintext token is never stored.';
COMMENT ON COLUMN public.support_tickets.source IS
  'Origin of the support case, for example website_live_chat or merchant_app.';
