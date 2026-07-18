
-- 1. Extend app_role enum with additional platform-staff roles.
-- Use IF NOT EXISTS so re-runs are safe.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'billing_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analyst';

-- 2. Helper: is the user platform staff (any of the 5 platform roles)?
-- Compare via ::text so we don't need the new enum values to be committed.
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(uuid) TO authenticated, service_role;

-- 3. Update handle_new_user to skip merchant provisioning for platform staff.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_is_merchant boolean;
  v_business_name text;
  v_full_name text;
  v_phone text;
  v_country text;
  v_tz text;
  v_emp_id text;
  v_user_count int;
  v_is_platform boolean;
BEGIN
  -- Platform staff never get a merchant profile or merchant role auto-created.
  v_is_platform :=
    COALESCE(NEW.raw_user_meta_data->>'platform_staff', '') = 'true'
    OR public.is_platform_staff(NEW.id);

  IF v_is_platform THEN
    RETURN NEW;
  END IF;

  v_business_name := NEW.raw_user_meta_data->>'business_name';
  v_is_merchant := v_business_name IS NOT NULL AND length(trim(v_business_name)) > 0;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'US');
  v_tz := COALESCE(NULLIF(NEW.raw_user_meta_data->>'time_zone', ''), 'America/New_York');

  SELECT count(*) INTO v_user_count FROM public.profiles;

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.stores (
      name, phone, country, time_zone, email, store_code,
      trial_ends_at, plan_tier, plan_status, plan_period_end
    ) VALUES (
      COALESCE(v_business_name, 'My Store'),
      v_phone, v_country, v_tz, NEW.email,
      public.generate_store_code(),
      now() + interval '14 days',
      'trial_pro', 'trialing', now() + interval '14 days'
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  -- If no store exists (e.g. platform-only project state), do not force a merchant record.
  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id, v_full_name, NEW.email, v_store_id, v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END $$;

-- 4. Role-exclusivity trigger: forbid mixing platform and merchant roles on one user.
CREATE OR REPLACE FUNCTION public.tg_enforce_role_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_new_platform boolean;
  v_has_merchant boolean;
  v_has_platform boolean;
BEGIN
  v_is_new_platform := NEW.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst');

  IF v_is_new_platform THEN
    -- Inserting a platform role: user must not already have any merchant role.
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role::text NOT IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
    ) INTO v_has_merchant;
    IF v_has_merchant THEN
      RAISE EXCEPTION 'User % already has a merchant role; platform-staff roles cannot be mixed with merchant roles.', NEW.user_id;
    END IF;
  ELSE
    -- Inserting a merchant role: user must not already have any platform role.
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
    ) INTO v_has_platform;
    IF v_has_platform THEN
      RAISE EXCEPTION 'User % is platform staff; merchant roles cannot be assigned to platform accounts.', NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_role_exclusivity ON public.user_roles;
CREATE TRIGGER trg_enforce_role_exclusivity
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_role_exclusivity();

-- 5. One-time cleanup: any user who already has a platform role must not carry merchant rows.
-- Delete their merchant user_roles first, then their profiles.
DELETE FROM public.user_roles ur
WHERE ur.role::text NOT IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id
      AND ur2.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
  );

DELETE FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id
    AND ur.role::text IN ('super_admin','operations_admin','support_admin','billing_admin','analyst')
);
