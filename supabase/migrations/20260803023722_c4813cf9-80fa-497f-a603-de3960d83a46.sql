CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The role membership check is always evaluated; the second clause only limits
  -- WHO may ask about another user's roles. Being the subject never grants a role.
  SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = ANY(_roles)
        AND store_id = public.current_store_id()
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('owner'::app_role, 'admin'::app_role)
          AND store_id = public.current_store_id()
      )
    );
$function$;

DROP POLICY IF EXISTS "product-images update same store" ON storage.objects;
CREATE POLICY "product-images update same store"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  AND public.current_store_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_store_id()::text
)
WITH CHECK (
  bucket_id = 'product-images'
  AND public.has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role,'admin'::app_role])
  AND owner = auth.uid()
  AND public.current_store_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_store_id()::text
);