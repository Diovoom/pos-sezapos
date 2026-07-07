-- 1) Lock down SECURITY DEFINER trigger function from anonymous execution
REVOKE EXECUTE ON FUNCTION public.tg_profiles_prevent_privileged_self_update() FROM PUBLIC, anon;

-- 2) Tighten profiles_update_own — prevent self-tampering of tenant/role columns
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
);

-- 3) Tighten self update time entries — prevent moving rows across tenants
DROP POLICY IF EXISTS "self update time entries" ON public.time_entries;
CREATE POLICY "self update time entries" ON public.time_entries
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND store_id = public.current_store_id())
WITH CHECK (user_id = auth.uid() AND store_id = public.current_store_id());