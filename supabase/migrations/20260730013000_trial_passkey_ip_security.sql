-- SEZA POS: one trial per verified business, IP signup monitoring, and passkeys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_trial_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_fingerprint text NOT NULL UNIQUE,
  normalized_business_name text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','trial_active','trial_used','paid','blocked','review')),
  first_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_trial_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_trial_registry FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_business_trial_registry_status ON public.business_trial_registry(status);

CREATE TABLE IF NOT EXISTS public.signup_risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text NOT NULL,
  email_hash text,
  business_fingerprint text,
  user_agent_hash text,
  country_code text,
  risk_score integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_risk_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_risk_events FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_signup_risk_ip_time ON public.signup_risk_events(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_risk_business ON public.signup_risk_events(business_fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Passkey',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own passkeys" ON public.passkey_credentials FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners rename own passkeys" ON public.passkey_credentials FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners remove own passkeys" ON public.passkey_credentials FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE INSERT ON public.passkey_credentials FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON public.passkey_credentials(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('registration','authentication')),
  challenge text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email_hash text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.passkey_challenges FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expiry ON public.passkey_challenges(expires_at);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_fingerprint text,
  ADD COLUMN IF NOT EXISTS business_verification_status text NOT NULL DEFAULT 'pending'
    CHECK (business_verification_status IN ('pending','verified','review','rejected')),
  ADD COLUMN IF NOT EXISTS trial_eligibility text NOT NULL DEFAULT 'pending'
    CHECK (trial_eligibility IN ('pending','eligible','used','blocked','review'));
CREATE INDEX IF NOT EXISTS idx_stores_business_fingerprint ON public.stores(business_fingerprint);

-- Start the trial only after Supabase confirms the owner's email and only when
-- the permanent business registry says this business has not used a trial.
CREATE OR REPLACE FUNCTION public.activate_verified_business_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_fp text;
  v_days integer := 14;
  v_registry public.business_trial_registry%ROWTYPE;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.store_id INTO v_store_id FROM public.profiles p WHERE p.id = NEW.id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.business_fingerprint INTO v_fp FROM public.stores s WHERE s.id = v_store_id;
  IF v_fp IS NULL OR v_fp = '' THEN
    UPDATE public.stores SET trial_eligibility='review', plan_status='inactive', trial_ends_at=NULL WHERE id=v_store_id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(default_trial_days,14) INTO v_days FROM public.platform_settings WHERE id='global';
  INSERT INTO public.business_trial_registry (business_fingerprint, normalized_business_name, first_user_id, first_store_id)
  VALUES (v_fp, lower(trim(COALESCE(NEW.raw_user_meta_data->>'business_name','business'))), NEW.id, v_store_id)
  ON CONFLICT (business_fingerprint) DO NOTHING;

  SELECT * INTO v_registry FROM public.business_trial_registry WHERE business_fingerprint=v_fp FOR UPDATE;
  IF v_registry.status IN ('trial_used','trial_active','paid','blocked')
     AND v_registry.first_user_id IS DISTINCT FROM NEW.id THEN
    UPDATE public.stores SET trial_eligibility='used', plan_status='inactive', trial_ends_at=NULL, plan_period_end=NULL WHERE id=v_store_id;
    RETURN NEW;
  END IF;

  UPDATE public.business_trial_registry
     SET status='trial_active', first_user_id=COALESCE(first_user_id,NEW.id), first_store_id=COALESCE(first_store_id,v_store_id),
         trial_started_at=COALESCE(trial_started_at,now()), trial_ends_at=COALESCE(trial_ends_at,now()+make_interval(days=>v_days)), updated_at=now()
   WHERE business_fingerprint=v_fp;

  UPDATE public.stores
     SET business_verification_status='verified', trial_eligibility='eligible', plan_tier='trial_pro', plan_status='trialing',
         trial_ends_at=COALESCE(trial_ends_at,now()+make_interval(days=>v_days)),
         plan_period_end=COALESCE(plan_period_end,now()+make_interval(days=>v_days))
   WHERE id=v_store_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS seza_activate_trial_after_email_verification ON auth.users;
CREATE TRIGGER seza_activate_trial_after_email_verification
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.activate_verified_business_trial();

-- New accounts are provisioned without an active trial. The trigger above
-- activates it only after email confirmation and registry eligibility.
CREATE OR REPLACE FUNCTION public.seza_prepare_new_store_trial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.business_fingerprint IS NOT NULL THEN
    NEW.plan_status := 'inactive';
    NEW.trial_ends_at := NULL;
    NEW.plan_period_end := NULL;
    NEW.trial_eligibility := 'pending';
    NEW.business_verification_status := 'pending';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seza_prepare_new_store_trial_trigger ON public.stores;
CREATE TRIGGER seza_prepare_new_store_trial_trigger BEFORE INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.seza_prepare_new_store_trial();

CREATE OR REPLACE FUNCTION public.seza_attach_signup_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_store uuid; v_fp text;
BEGIN
  v_fp := NEW.raw_user_meta_data->>'business_fingerprint';
  IF v_fp IS NULL OR v_fp='' THEN RETURN NEW; END IF;
  SELECT store_id INTO v_store FROM public.profiles WHERE id=NEW.id;
  IF v_store IS NOT NULL THEN
    UPDATE public.stores SET business_fingerprint=v_fp, plan_status='inactive', trial_ends_at=NULL, plan_period_end=NULL,
      trial_eligibility='pending', business_verification_status='pending' WHERE id=v_store;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zzz_seza_attach_signup_identity ON auth.users;
CREATE TRIGGER zzz_seza_attach_signup_identity AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.seza_attach_signup_identity();
