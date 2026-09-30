-- Restore the contract already used by the live Support clients.
CREATE OR REPLACE FUNCTION public.merchant_mark_support_read(_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.support_tickets t JOIN public.profiles p ON p.id=auth.uid()
   WHERE t.id=_ticket_id AND p.status='active' AND t.store_id=p.store_id
    AND (t.requester_id=auth.uid() OR public.has_any_role(auth.uid(),ARRAY['owner','admin','manager']::public.app_role[]))
 ) THEN RAISE EXCEPTION 'Support case not found' USING ERRCODE='42501'; END IF;
 UPDATE public.support_tickets SET last_merchant_read_at=now() WHERE id=_ticket_id;
END $$;
REVOKE ALL ON FUNCTION public.merchant_mark_support_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merchant_mark_support_read(uuid) TO authenticated;

-- A client cannot forge an Admin sender label by writing this display field.
CREATE OR REPLACE FUNCTION public.tg_support_note_sender_kind() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 NEW.sender_kind := CASE WHEN NEW.author_id IS NULL THEN
   CASE WHEN auth.role()='service_role' AND NEW.sender_kind='visitor' THEN 'visitor' ELSE 'system' END
   WHEN public.is_platform_staff(NEW.author_id) THEN 'admin' ELSE 'merchant' END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_support_note_sender_kind() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER seza_support_note_sender_kind BEFORE INSERT OR UPDATE OF author_id,sender_kind ON public.support_ticket_notes
FOR EACH ROW EXECUTE FUNCTION public.tg_support_note_sender_kind();

-- Pending requests are visible for consent. Only the consenting merchant
-- employee can read an active session; ended/expired history is Admin-only.
DROP POLICY IF EXISTS admin_support_sessions_merchant_read ON public.admin_support_sessions;
CREATE POLICY admin_support_sessions_merchant_read ON public.admin_support_sessions FOR SELECT TO authenticated
USING (store_id=(SELECT public.current_store_id()) AND expires_at>now()
 AND (status='pending' OR (status='active' AND decided_by=(SELECT auth.uid()))));

CREATE SCHEMA IF NOT EXISTS seza_private;
REVOKE ALL ON SCHEMA seza_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA seza_private TO authenticated;
CREATE OR REPLACE FUNCTION seza_private.can_signal_support(_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.admin_support_sessions s JOIN public.profiles p ON p.id=auth.uid()
   WHERE 'support-rtc-'||s.channel_token::text=_topic AND s.status='active' AND s.expires_at>now()
     AND p.status='active' AND (
       (s.decided_by=auth.uid() AND s.store_id=p.store_id)
       OR (s.admin_id=auth.uid() AND EXISTS(SELECT 1 FROM public.user_roles u WHERE u.user_id=auth.uid()
             AND u.role::text IN ('super_admin','operations_admin','support_admin')))
     )
 );
$$;
REVOKE ALL ON FUNCTION seza_private.can_signal_support(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION seza_private.can_signal_support(text) TO authenticated;
CREATE POLICY seza_support_signal_read ON realtime.messages FOR SELECT TO authenticated
USING (extension='broadcast' AND (SELECT seza_private.can_signal_support(realtime.topic())));
CREATE POLICY seza_support_signal_write ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (extension='broadcast' AND (SELECT seza_private.can_signal_support(realtime.topic())));

-- Publish existing RLS-protected tables that the current apps already watch.
-- No heartbeat or hardware polling behavior is changed.
DO $$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['stores','products','categories','profiles','role_permissions','subscriptions','sales','sale_items','sale_payments','refunds','refund_items','device_registrations'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table) THEN
     EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
   END IF;
 END LOOP;
END $$;

-- Staging is service-only; RLS makes that boundary explicit as defense in depth.
ALTER TABLE public.seza_migration_staging ENABLE ROW LEVEL SECURITY;
