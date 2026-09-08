-- Ensure every deployed schema accepts the native Android live screen-share
-- capability, including projects that were upgraded from the older 20260721
-- constraint which only allowed web_screen_share/android_diagnostics_only.

ALTER TABLE public.admin_support_sessions
  DROP CONSTRAINT IF EXISTS admin_support_sessions_client_capability_check;

ALTER TABLE public.admin_support_sessions
  ADD CONSTRAINT admin_support_sessions_client_capability_check
  CHECK (
    client_capability IS NULL
    OR client_capability IN (
      'web_screen_share',
      'android_diagnostics_only',
      'android_screen_share'
    )
  );
