
-- ============================================================
-- 1. role_permissions: partition per store (tenant scoping)
-- ============================================================
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Backfill: for each store, create a copy of every existing global row
INSERT INTO public.role_permissions (role, permission, store_id)
SELECT rp.role, rp.permission, s.id
FROM public.role_permissions rp
CROSS JOIN public.stores s
WHERE rp.store_id IS NULL
ON CONFLICT DO NOTHING;

-- Remove legacy global rows now that per-store copies exist
DELETE FROM public.role_permissions WHERE store_id IS NULL;

ALTER TABLE public.role_permissions ALTER COLUMN store_id SET NOT NULL;

-- Replace unique constraint to include store_id
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_permission_key;
DO $$ BEGIN
  ALTER TABLE public.role_permissions
    ADD CONSTRAINT role_permissions_store_role_permission_key UNIQUE (store_id, role, permission);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS role_permissions_store_idx ON public.role_permissions (store_id);

-- Recreate policies scoped to caller's store
DROP POLICY IF EXISTS "Anyone signed in can read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Owners and admins manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Management can read role permissions" ON public.role_permissions;

CREATE POLICY "Management can read role permissions"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

CREATE POLICY "Owners and admins manage role permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  )
  WITH CHECK (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  );

-- Update has_permission to join on store as well as role
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$$;

-- ============================================================
-- 2. sms_send_log_select_store: restrict role grant to authenticated
-- ============================================================
DROP POLICY IF EXISTS sms_send_log_select_store ON public.sms_send_log;
CREATE POLICY sms_send_log_select_store ON public.sms_send_log
  FOR SELECT TO authenticated
  USING (
    store_id = public.current_store_id()
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'manager'::app_role])
  );

-- ============================================================
-- 3. storage.avatars admin write: scope to same-store users only
-- ============================================================
DROP POLICY IF EXISTS avatars_admin_write ON storage.objects;
CREATE POLICY avatars_admin_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_owner
      JOIN public.profiles p_me ON p_me.id = auth.uid()
      WHERE p_owner.id = storage.objects.owner
        AND p_owner.store_id IS NOT NULL
        AND p_owner.store_id = p_me.store_id
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_owner
      JOIN public.profiles p_me ON p_me.id = auth.uid()
      WHERE p_owner.id = storage.objects.owner
        AND p_owner.store_id IS NOT NULL
        AND p_owner.store_id = p_me.store_id
    )
  );
