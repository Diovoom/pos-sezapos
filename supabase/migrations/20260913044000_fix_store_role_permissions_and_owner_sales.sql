-- Keep tenant-scoped POS permissions complete for existing and future stores.
-- Owners/admins are store administrators and must never be locked out of
-- sale finalization because a role_permissions seed row is missing.

INSERT INTO public.role_permissions (store_id, role, permission)
SELECT s.id, defaults.role::public.app_role, defaults.permission
FROM public.stores s
CROSS JOIN (
  VALUES
    ('owner', '*'),
    ('admin', '*'),
    ('manager', 'sales.create'),
    ('manager', 'sales.void'),
    ('manager', 'sales.discount'),
    ('manager', 'sales.price_override'),
    ('manager', 'refunds.create'),
    ('manager', 'refunds.approve'),
    ('manager', 'products.edit'),
    ('manager', 'products.delete'),
    ('manager', 'inventory.edit'),
    ('manager', 'reports.view'),
    ('manager', 'reports.export'),
    ('manager', 'register.open'),
    ('manager', 'register.close'),
    ('manager', 'employees.view'),
    ('manager', 'settings.view'),
    ('cashier', 'sales.create'),
    ('cashier', 'sales.discount'),
    ('cashier', 'register.open'),
    ('cashier', 'register.close')
) AS defaults(role, permission)
ON CONFLICT (store_id, role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_role_permissions_for_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.role_permissions (store_id, role, permission)
  SELECT NEW.id, defaults.role::public.app_role, defaults.permission
  FROM (
    VALUES
      ('owner', '*'),
      ('admin', '*'),
      ('manager', 'sales.create'),
      ('manager', 'sales.void'),
      ('manager', 'sales.discount'),
      ('manager', 'sales.price_override'),
      ('manager', 'refunds.create'),
      ('manager', 'refunds.approve'),
      ('manager', 'products.edit'),
      ('manager', 'products.delete'),
      ('manager', 'inventory.edit'),
      ('manager', 'reports.view'),
      ('manager', 'reports.export'),
      ('manager', 'register.open'),
      ('manager', 'register.close'),
      ('manager', 'employees.view'),
      ('manager', 'settings.view'),
      ('cashier', 'sales.create'),
      ('cashier', 'sales.discount'),
      ('cashier', 'register.open'),
      ('cashier', 'register.close')
  ) AS defaults(role, permission)
  ON CONFLICT (store_id, role, permission) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_role_permissions_for_store ON public.stores;
CREATE TRIGGER trg_seed_default_role_permissions_for_store
AFTER INSERT ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_role_permissions_for_store();

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.store_id = public.current_store_id()
      AND (
        ur.role IN ('owner'::public.app_role, 'admin'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.store_id = ur.store_id
            AND rp.role = ur.role
            AND (rp.permission = _permission OR rp.permission = '*')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
