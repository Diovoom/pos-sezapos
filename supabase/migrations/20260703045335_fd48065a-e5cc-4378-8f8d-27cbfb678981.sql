
-- ============================================================
-- 1. sales: explicit deny for DELETE (fail-closed, documented)
-- ============================================================
DROP POLICY IF EXISTS sales_no_delete ON public.sales;
CREATE POLICY sales_no_delete ON public.sales
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 2. country_profiles: restrict reads to authenticated users
-- ============================================================
DROP POLICY IF EXISTS "country_profiles readable by all" ON public.country_profiles;
DROP POLICY IF EXISTS country_profiles_select_authenticated ON public.country_profiles;
CREATE POLICY country_profiles_select_authenticated
  ON public.country_profiles
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 3. storage.avatars: allow owners to manage their own avatar
--    Path convention: "<profile_id>/avatar-*.ext"
-- ============================================================
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ============================================================
-- 4. storage.product-images: tighten update/delete with
--    same-store scoping (uploader must share the current user's store)
-- ============================================================
DROP POLICY IF EXISTS "product-images update same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images delete same store" ON storage.objects;

CREATE POLICY "product-images update same store" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p_owner
        JOIN public.profiles p_me ON p_me.id = auth.uid()
        WHERE p_owner.id = storage.objects.owner
          AND p_owner.store_id IS NOT NULL
          AND p_owner.store_id = p_me.store_id
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

CREATE POLICY "product-images delete same store" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p_owner
        JOIN public.profiles p_me ON p_me.id = auth.uid()
        WHERE p_owner.id = storage.objects.owner
          AND p_owner.store_id IS NOT NULL
          AND p_owner.store_id = p_me.store_id
      )
    )
  );

-- ============================================================
-- 5. SECURITY DEFINER helpers not used in RLS policies: revoke
--    direct RPC access from anon/authenticated. Service role and
--    server functions (via context.supabase) that need these are
--    already handled through admin client or removed usage.
--    The three helpers still used in RLS policies (has_role,
--    has_any_role, current_store_id) MUST remain executable by
--    authenticated for RLS to evaluate; that is Supabase's own
--    recommended pattern.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_active_plan(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_plan(uuid, text) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_read_only(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_read_only(uuid) FROM anon, authenticated;

-- Harden the RLS-referenced helpers with in-function authorization:
-- only allow lookups against the caller's own uid, admins/owners, or
-- the service_role. RLS calls always pass auth.uid() and are unaffected.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('owner'::app_role, 'admin'::app_role)
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('owner'::app_role, 'admin'::app_role)
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)
    )
    ELSE false
  END
$$;
