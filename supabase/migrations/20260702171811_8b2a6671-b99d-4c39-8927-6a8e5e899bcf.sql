
-- Add unique short store code
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_store_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  LOOP
    new_code := 'SZ-';
    FOR i IN 1..6 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stores WHERE store_code = new_code);
  END LOOP;
  RETURN new_code;
END $$;

REVOKE EXECUTE ON FUNCTION public.generate_store_code() FROM PUBLIC, anon, authenticated;

-- Backfill existing stores without codes
UPDATE public.stores SET store_code = public.generate_store_code() WHERE store_code IS NULL;

-- Rewrite handle_new_user: a merchant signup is any auth.users row whose
-- raw_user_meta_data contains `business_name`. It creates a brand-new store,
-- profile, and owner role. Any other signup (e.g. staff invited later, or the
-- very first bootstrap user) falls back to attaching to the first existing
-- store as cashier — preserving prior behavior.
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
BEGIN
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
      v_phone,
      v_country,
      v_tz,
      NEW.email,
      public.generate_store_code(),
      now() + interval '14 days',
      'trial_pro',
      'trialing',
      now() + interval '14 days'
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
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
