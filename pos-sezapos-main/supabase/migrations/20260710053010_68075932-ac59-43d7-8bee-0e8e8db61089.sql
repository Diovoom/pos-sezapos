DROP POLICY IF EXISTS sms_send_log_select_store ON public.sms_send_log;
CREATE POLICY sms_send_log_select_store ON public.sms_send_log
FOR SELECT
USING (
  store_id = public.current_store_id()
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
);