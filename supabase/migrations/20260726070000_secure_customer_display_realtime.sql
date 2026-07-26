-- Secure the customer-facing display channel.
--
-- Previously, customer-display:<store_id> was a public Broadcast channel.
-- Anyone with the browser publishable key and a store UUID could join the
-- topic and spoof cart/payment-complete messages. These policies require an
-- authenticated user who belongs to the store encoded in the channel topic.

DROP POLICY IF EXISTS "store users can receive customer display broadcasts"
  ON realtime.messages;
DROP POLICY IF EXISTS "store users can send customer display broadcasts"
  ON realtime.messages;

CREATE POLICY "store users can receive customer display broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~
    '^customer-display:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  AND public.current_store_id() =
    split_part((SELECT realtime.topic()), ':', 2)::uuid
);

CREATE POLICY "store users can send customer display broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~
    '^customer-display:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  AND public.current_store_id() =
    split_part((SELECT realtime.topic()), ':', 2)::uuid
);
