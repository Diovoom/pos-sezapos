-- Security hardening for role checks, private customer-display broadcasts,
-- and tenant-scoped product image writes.

-- Role helpers must never treat a matching user id as proof of a role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles actor
        WHERE actor.user_id = auth.uid()
          AND actor.role IN ('owner'::public.app_role, 'admin'::public.app_role)
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = ANY(_roles)
    )
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles actor
        WHERE actor.user_id = auth.uid()
          AND actor.role IN ('owner'::public.app_role, 'admin'::public.app_role)
      )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id AND p.store_id = _store_id
    UNION ALL
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.store_id = _store_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO authenticated, service_role;

-- Customer display topics are private and restricted to members of the store
-- encoded in customer-display:<store_uuid>.
DROP POLICY IF EXISTS "store users can receive customer display broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "store users can send customer display broadcasts" ON realtime.messages;

CREATE POLICY "store users can receive private customer display broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~ '^customer-display:[0-9a-fA-F-]{36}$'
  AND public.is_store_member(split_part((SELECT realtime.topic()), ':', 2)::uuid, auth.uid())
);

CREATE POLICY "store users can send private customer display broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) ~ '^customer-display:[0-9a-fA-F-]{36}$'
  AND public.is_store_member(split_part((SELECT realtime.topic()), ':', 2)::uuid, auth.uid())
);

-- Product image object names now begin with the store id. Both USING and
-- WITH CHECK enforce the same tenant folder, preventing cross-store moves.
DROP POLICY IF EXISTS "product-images authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "product-images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "product-images public read" ON storage.objects;
DROP POLICY IF EXISTS "product-images read same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images insert same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images update same store" ON storage.objects;
DROP POLICY IF EXISTS "product-images delete same store" ON storage.objects;

CREATE POLICY "product-images read same store"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "product-images insert same store"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);

CREATE POLICY "product-images update same store"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles owner_profile
    WHERE owner_profile.id = storage.objects.owner
      AND owner_profile.store_id = ((storage.foldername(name))[1])::uuid
  )
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);

CREATE POLICY "product-images delete same store"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid, auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);
