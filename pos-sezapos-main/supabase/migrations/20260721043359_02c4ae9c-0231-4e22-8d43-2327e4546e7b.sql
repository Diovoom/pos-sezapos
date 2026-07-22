
-- 1) Restrict admin_permissions catalog reads to platform staff.
DROP POLICY IF EXISTS "admin_permissions_read_all_authenticated" ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_permissions_read_authenticated" ON public.admin_permissions;
DROP POLICY IF EXISTS "Admin permissions readable" ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_permissions_select" ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_permissions read authenticated" ON public.admin_permissions;

CREATE POLICY "admin_permissions_platform_staff_read"
  ON public.admin_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_staff(auth.uid()));

-- 2) Unguessable per-session channel token for the WebRTC signaling topic.
--    RLS on admin_support_sessions already restricts reads to the assigned
--    admin and the target store's employees, so only those participants can
--    ever learn the token and join the private topic.
ALTER TABLE public.admin_support_sessions
  ADD COLUMN IF NOT EXISTS channel_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS admin_support_sessions_channel_token_idx
  ON public.admin_support_sessions(channel_token);
