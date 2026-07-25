-- Restrict employee self-service updates on public.profiles to safe personal
-- columns using column-level UPDATE grants. Owner/admin/manager employee
-- management continues to run through service_role server functions.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  first_name,
  last_name,
  full_name,
  phone,
  photo_url,
  avatar_url,
  preferred_language,
  preferred_locale,
  updated_at
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

-- Keep the defence-in-depth trigger and replace the self-update policy with an
-- equivalent, explicitly scoped one (no duplicate policies).
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() AND status = 'active')
WITH CHECK (
  id = auth.uid()
  AND status = 'active'
  AND store_id = (SELECT p.store_id FROM public.profiles p WHERE p.id = auth.uid())
);