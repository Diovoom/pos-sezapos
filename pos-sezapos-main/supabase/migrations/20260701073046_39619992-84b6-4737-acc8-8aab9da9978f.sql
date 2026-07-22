
-- 1. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS employee_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS hire_date date;

-- 2. Employee-ID generator
CREATE OR REPLACE FUNCTION public.generate_employee_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id text;
BEGIN
  LOOP
    new_id := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id = new_id);
  END LOOP;
  RETURN new_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;

-- 3. Backfill
UPDATE public.profiles SET employee_id = public.generate_employee_id() WHERE employee_id IS NULL;

-- 4. Quick-login helper (id -> email, only if account is active)
CREATE OR REPLACE FUNCTION public.email_for_employee_id(p_employee_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
    FROM public.profiles
   WHERE employee_id = p_employee_id
     AND status = 'active'
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.email_for_employee_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_for_employee_id(text) TO anon, authenticated;

-- 5. Time entries
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  break_start timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self insert time entries" ON public.time_entries;
CREATE POLICY "self insert time entries" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self update time entries" ON public.time_entries;
CREATE POLICY "self update time entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self and managers read time entries" ON public.time_entries;
CREATE POLICY "self and managers read time entries" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE INDEX IF NOT EXISTS time_entries_user_idx ON public.time_entries (user_id, clock_in DESC);

-- 6. Handle_new_user: ensure new signups also get an employee_id.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_user_count int;
  v_emp_id text;
BEGIN
  SELECT count(*) INTO v_user_count FROM public.profiles;
  IF v_user_count = 0 THEN
    INSERT INTO public.stores (name) VALUES ('My Store') RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (id, full_name, email, store_id, employee_id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    v_store_id,
    v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id) VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END
$$;
