DO $$
DECLARE
  v_uid uuid := '75865a02-5e9f-4adc-9e0c-9de175205d18';
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Auth user % does not exist', v_uid;
  END IF;

  ALTER TABLE public.user_roles DISABLE TRIGGER trg_protect_super_admin;
  INSERT INTO public.user_roles (user_id, role, store_id)
    VALUES (v_uid, 'super_admin', NULL)
    ON CONFLICT DO NOTHING;
  ALTER TABLE public.user_roles ENABLE TRIGGER trg_protect_super_admin;

  SELECT count(*) INTO v_count
    FROM public.user_roles
   WHERE user_id = v_uid AND role = 'super_admin';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 super_admin row for %, found %', v_uid, v_count;
  END IF;
END $$;