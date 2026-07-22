-- SEZA Admin company operations hardening
-- Safe to apply after 20260722090000_admin_company_operations.sql.

-- --------------------------------------------------------------------------
-- 1. Trusted sender identity for persistent support chat
-- --------------------------------------------------------------------------
ALTER TABLE public.support_ticket_notes
  ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'merchant';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_ticket_notes_sender_kind_check'
  ) THEN
    ALTER TABLE public.support_ticket_notes
      ADD CONSTRAINT support_ticket_notes_sender_kind_check
      CHECK (sender_kind IN ('merchant', 'admin', 'system'));
  END IF;
END $$;

UPDATE public.support_ticket_notes
SET sender_kind = CASE
  WHEN author_id IS NOT NULL AND public.is_platform_staff(author_id) THEN 'admin'
  ELSE 'merchant'
END;

CREATE OR REPLACE FUNCTION public.tg_support_note_sender_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.sender_kind := CASE
    WHEN NEW.author_id IS NOT NULL AND public.is_platform_staff(NEW.author_id) THEN 'admin'
    ELSE 'merchant'
  END;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_note_sender_kind ON public.support_ticket_notes;
CREATE TRIGGER support_note_sender_kind
  BEFORE INSERT OR UPDATE OF author_id ON public.support_ticket_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_note_sender_kind();

-- --------------------------------------------------------------------------
-- 2. Merchant support privacy
-- Cashiers may only read and chat on cases they personally opened.
-- Owners/admins/managers may support their whole store. Platform staff retain
-- access through the separate platform-staff policies.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS support_tickets_merchant_view ON public.support_tickets;
CREATE POLICY support_tickets_merchant_view
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    store_id IS NOT NULL
    AND store_id = public.current_store_id()
    AND (
      requester_id = auth.uid()
      OR public.has_any_role(
        auth.uid(),
        ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
      )
    )
  );

-- Ticket status, assignment, and resolution are controlled only by audited
-- SEZA server functions. Merchant clients never need direct ticket UPDATE.
DROP POLICY IF EXISTS support_tickets_merchant_update ON public.support_tickets;

DROP POLICY IF EXISTS ticket_notes_merchant_view ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_view
  ON public.support_ticket_notes
  FOR SELECT
  TO authenticated
  USING (
    internal = false
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets ticket
      WHERE ticket.id = ticket_id
        AND ticket.store_id = public.current_store_id()
        AND (
          ticket.requester_id = auth.uid()
          OR public.has_any_role(
            auth.uid(),
            ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
          )
        )
    )
  );

DROP POLICY IF EXISTS ticket_notes_merchant_insert ON public.support_ticket_notes;
CREATE POLICY ticket_notes_merchant_insert
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND internal = false
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets ticket
      WHERE ticket.id = ticket_id
        AND ticket.store_id = public.current_store_id()
        AND (
          ticket.requester_id = auth.uid()
          OR public.has_any_role(
            auth.uid(),
            ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]
          )
        )
    )
  );

-- --------------------------------------------------------------------------
-- 3. Never expose the paired-device secret hash to authenticated clients.
-- API verification still works because server endpoints use service_role.
-- --------------------------------------------------------------------------
REVOKE SELECT ON TABLE public.device_registrations FROM authenticated;
GRANT SELECT (
  id,
  store_id,
  label,
  status,
  platform,
  paired_by,
  paired_at,
  last_seen_at,
  revoked_at,
  revoked_by,
  revoke_reason,
  created_at,
  updated_at,
  status_snapshot,
  app_version,
  last_sync_at
) ON TABLE public.device_registrations TO authenticated;

-- Ensure the founder metadata remains authoritative even if the profile name
-- or company-staff row was edited elsewhere.
INSERT INTO public.admin_staff_profiles (
  user_id,
  title,
  department,
  employment_status
)
SELECT
  profile.id,
  'Founder & CEO',
  'Executive',
  'active'
FROM public.profiles profile
WHERE lower(profile.email) = 'admin@sezapos.com'
ON CONFLICT (user_id) DO UPDATE
SET title = 'Founder & CEO',
    department = 'Executive',
    employment_status = 'active';

-- --------------------------------------------------------------------------
-- 4. Make the founder-controlled default trial length operational for every
-- new merchant account, while always excluding invited SEZA company staff
-- from merchant provisioning.
-- --------------------------------------------------------------------------
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
  v_trial_days integer := 14;
BEGIN
  v_is_platform :=
    COALESCE(NEW.raw_user_meta_data->>'platform_staff', '') = 'true'
    OR COALESCE(NEW.raw_user_meta_data->>'seza_company_staff', '') = 'true'
    OR public.is_platform_staff(NEW.id);

  IF v_is_platform THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(default_trial_days, 14)
  INTO v_trial_days
  FROM public.platform_settings
  WHERE id = 'global';
  v_trial_days := COALESCE(v_trial_days, 14);

  v_business_name := NEW.raw_user_meta_data->>'business_name';
  v_is_merchant := v_business_name IS NOT NULL AND length(trim(v_business_name)) > 0;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'US');
  v_tz := COALESCE(NULLIF(NEW.raw_user_meta_data->>'time_zone', ''), 'America/New_York');

  SELECT count(*) INTO v_user_count FROM public.profiles;

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.stores (
      name,
      phone,
      country,
      time_zone,
      email,
      store_code,
      trial_ends_at,
      plan_tier,
      plan_status,
      plan_period_end
    ) VALUES (
      COALESCE(v_business_name, 'My Store'),
      v_phone,
      v_country,
      v_tz,
      NEW.email,
      public.generate_store_code(),
      now() + make_interval(days => v_trial_days),
      'trial_pro',
      'trialing',
      now() + make_interval(days => v_trial_days)
    ) RETURNING id INTO v_store_id;
  ELSE
    SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  END IF;

  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_emp_id := public.generate_employee_id();

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    store_id,
    employee_id,
    first_name,
    last_name
  ) VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_store_id,
    v_emp_id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  IF v_is_merchant OR v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, store_id)
    VALUES (NEW.id, 'owner', v_store_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, store_id)
    VALUES (NEW.id, 'cashier', v_store_id);
  END IF;

  RETURN NEW;
END
$$;

-- --------------------------------------------------------------------------
-- 5. Make the global headquarters search useful to all authorized SEZA staff.
-- Results remain read-only; page mutations keep their stricter server gates.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_global_search(_q text, _limit int DEFAULT 25)
RETURNS TABLE(kind text, id uuid, store_id uuid, label text, sublabel text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(coalesce(_q, '')));
  max_rows integer := greatest(1, least(coalesce(_limit, 25), 50));
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'business'::text, store.id, store.id,
           store.name,
           coalesce(store.email, store.store_code, store.city, '')::text
    FROM public.stores store
    WHERE lower(store.name) LIKE '%' || q || '%'
       OR lower(coalesce(store.store_code, '')) LIKE '%' || q || '%'
       OR lower(coalesce(store.email, '')) LIKE '%' || q || '%'
       OR lower(coalesce(store.phone, '')) LIKE '%' || q || '%'
       OR store.id::text = q
    ORDER BY store.created_at DESC
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'owner'::text, profile.id, profile.store_id,
           coalesce(profile.full_name, profile.email, '(no name)')::text,
           coalesce(profile.email, profile.phone, '')::text
    FROM public.profiles profile
    JOIN public.user_roles role
      ON role.user_id = profile.id
     AND role.role IN ('owner'::app_role, 'admin'::app_role)
    WHERE lower(coalesce(profile.full_name, '')) LIKE '%' || q || '%'
       OR lower(coalesce(profile.email, '')) LIKE '%' || q || '%'
       OR lower(coalesce(profile.phone, '')) LIKE '%' || q || '%'
       OR profile.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'register'::text, device.id, device.store_id,
           device.label,
           concat_ws(' · ', device.platform, device.app_version, device.status)::text
    FROM public.device_registrations device
    WHERE lower(device.label) LIKE '%' || q || '%'
       OR lower(coalesce(device.platform, '')) LIKE '%' || q || '%'
       OR device.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'card reader'::text, terminal.id, terminal.store_id,
           terminal.label,
           coalesce(terminal.serial, terminal.provider, '')::text
    FROM public.payment_terminals terminal
    WHERE lower(terminal.label) LIKE '%' || q || '%'
       OR lower(coalesce(terminal.serial, '')) LIKE '%' || q || '%'
       OR terminal.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'subscription'::text, subscription.id, subscription.store_id,
           coalesce(subscription.stripe_subscription_id, subscription.id::text),
           concat_ws(' · ', subscription.status, subscription.environment)::text
    FROM public.subscriptions subscription
    WHERE lower(coalesce(subscription.stripe_subscription_id, '')) LIKE '%' || q || '%'
       OR lower(coalesce(subscription.stripe_customer_id, '')) LIKE '%' || q || '%'
       OR subscription.id::text = q
    LIMIT max_rows;

  RETURN QUERY
    SELECT 'support'::text, ticket.id, ticket.store_id,
           concat('#', ticket.ticket_number, ' · ', ticket.subject)::text,
           concat_ws(' · ', ticket.requester_email, ticket.status, ticket.priority)::text
    FROM public.support_tickets ticket
    WHERE lower(ticket.subject) LIKE '%' || q || '%'
       OR lower(coalesce(ticket.requester_email, '')) LIKE '%' || q || '%'
       OR ticket.ticket_number::text = q
       OR ticket.id::text = q
    ORDER BY ticket.updated_at DESC
    LIMIT max_rows;
END
$$;

REVOKE ALL ON FUNCTION public.admin_global_search(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_global_search(text, int) TO authenticated;
