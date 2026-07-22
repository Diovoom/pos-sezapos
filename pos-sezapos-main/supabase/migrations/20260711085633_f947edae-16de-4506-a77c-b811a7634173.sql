DROP POLICY IF EXISTS "product-images insert same store" ON storage.objects;
CREATE POLICY "product-images insert same store"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])
  AND owner = auth.uid()
);