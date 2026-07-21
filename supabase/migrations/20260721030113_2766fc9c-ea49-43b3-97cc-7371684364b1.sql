
-- Track what the merchant client can actually do when accepting a support session.
-- 'web_screen_share' = browser with getDisplayMedia (WebRTC screen streaming)
-- 'android_diagnostics_only' = bundled Android APK (no screen streaming; diagnostics context only)
ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS client_capability text
    CHECK (client_capability IN ('web_screen_share', 'android_diagnostics_only'));

ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS client_metadata jsonb;

COMMENT ON COLUMN public.admin_support_sessions.client_capability IS
  'Set by the merchant client when it accepts. Tells the admin viewer whether to expect a WebRTC screen stream or diagnostics-only context.';
COMMENT ON COLUMN public.admin_support_sessions.client_metadata IS
  'Safe, non-secret client context captured at accept time (platform, app version, os, device model, route). Redacted of PINs, tokens, card data.';
