
-- 1) Fix mutable search_path on public functions
ALTER FUNCTION public.plan_tier_for_product(text) SET search_path = public;
ALTER FUNCTION public.tier_rank(text) SET search_path = public;

-- 2) Restrict email tables to service_role only
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "service_role manages send log" ON public.email_send_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "service_role manages send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "service_role manages unsubscribe tokens" ON public.email_unsubscribe_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "service_role manages suppressed emails" ON public.suppressed_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Revoke EXECUTE from signed-in users on internal SECURITY DEFINER functions.
--    RLS helper functions (has_role, has_any_role, has_permission, has_active_plan,
--    is_read_only, current_store_id, email_for_employee_id) remain callable so
--    row-level policies and existing server flows keep working.

REVOKE EXECUTE ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_store_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_store_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.simulate_trial_expiry(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_restock_on_refund() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_time_entries_compute_late() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_update_sale_refund_totals() FROM PUBLIC, anon, authenticated;
