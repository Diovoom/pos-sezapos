
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_admin_write" ON storage.objects;
CREATE POLICY "avatars_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  );
