-- SEZA POS — consolidated STRUCTURE-ONLY schema for a fresh Supabase project.
-- Generated from the live database. Contains NO production rows, NO auth users,
-- NO secrets, NO storage objects, and NO hardcoded old project URLs.
-- Apply against an empty project, in a single transaction-less run (some
-- statements such as CREATE EXTENSION / pgmq.create cannot share a transaction).

-- SECTION: EXTENSIONS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm    WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- SECTION: ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'cashier', 'admin', 'super_admin', 'operations_admin', 'support_admin', 'billing_admin', 'analyst');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'tap', 'apple_pay', 'google_pay', 'gift_card', 'split', 'store_credit');

-- SECTION: SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS public.support_tickets_ticket_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1;

-- SECTION: TABLES
CREATE TABLE public.admin_login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  success boolean NOT NULL,
  ip text,
  user_agent text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_permissions (
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_support_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  admin_email text,
  store_id uuid,
  reason text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:30:00'::interval),
  status text NOT NULL DEFAULT 'pending'::text,
  decided_at timestamp with time zone,
  decided_by uuid,
  decision_note text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  client_capability text,
  client_metadata jsonb,
  channel_token uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE TABLE public.age_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  cashier_id uuid,
  cashier_email text,
  sale_id uuid,
  product_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  min_age smallint NOT NULL,
  method text NOT NULL,
  result text NOT NULL,
  customer_dob date,
  id_expires_on date,
  id_document_last4 text,
  id_full_name_masked text,
  manager_override_id uuid,
  override_reason text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.api_rate_limit_buckets (
  key_hash text NOT NULL,
  scope text NOT NULL,
  window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  blocked_until timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  store_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.business_trial_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_fingerprint text NOT NULL,
  normalized_business_name text NOT NULL,
  status text NOT NULL DEFAULT 'reserved'::text,
  first_user_id uuid,
  first_store_id uuid,
  trial_started_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  register_session_id uuid NOT NULL,
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  idempotency_key text
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  name text NOT NULL,
  color text DEFAULT '#2563eb'::text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.country_profiles (
  country_code text NOT NULL,
  country_name text NOT NULL,
  default_language text NOT NULL DEFAULT 'en'::text,
  default_locale text NOT NULL DEFAULT 'en-US'::text,
  currency_code text NOT NULL,
  currency_symbol text NOT NULL,
  symbol_position text NOT NULL DEFAULT 'before'::text,
  decimal_precision integer NOT NULL DEFAULT 2,
  thousands_sep text NOT NULL DEFAULT ','::text,
  decimal_sep text NOT NULL DEFAULT '.'::text,
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY'::text,
  time_format text NOT NULL DEFAULT 'h:mm A'::text,
  address_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_format text,
  postal_regex text,
  paper_size text NOT NULL DEFAULT 'letter'::text,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  tax_inclusive_default boolean NOT NULL DEFAULT false,
  receipt_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_reg_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rtl boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.device_pairing_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  store_id uuid NOT NULL,
  label text NOT NULL,
  created_by uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_device_id uuid,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.device_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  label text NOT NULL,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  platform text,
  paired_by uuid,
  paired_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text,
  last_sync_at timestamp with time zone
);

CREATE TABLE public.email_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.email_send_state (
  id integer NOT NULL DEFAULT 1,
  retry_after_until timestamp with time zone,
  batch_size integer NOT NULL DEFAULT 10,
  send_delay_ms integer NOT NULL DEFAULT 200,
  auth_email_ttl_minutes integer NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes integer NOT NULL DEFAULT 60,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.email_unsubscribe_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  used_at timestamp with time zone
);

CREATE TABLE public.legal_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'setup_wizard'::text
);

CREATE TABLE public.passkey_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  challenge text NOT NULL,
  user_id uuid,
  email_hash text,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.passkey_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}'::text[],
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Passkey'::text,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  attempted_by uuid,
  provider text,
  method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD'::text,
  status text NOT NULL,
  message text,
  reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_terminals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'manual'::text,
  serial text,
  location text,
  status text NOT NULL DEFAULT 'inactive'::text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_settings (
  id text NOT NULL DEFAULT 'global'::text,
  company_name text NOT NULL DEFAULT 'SEZA POS'::text,
  support_email text NOT NULL DEFAULT 'support@sezapos.com'::text,
  billing_email text NOT NULL DEFAULT 'billing@sezapos.com'::text,
  incident_email text NOT NULL DEFAULT 'admin@sezapos.com'::text,
  timezone text NOT NULL DEFAULT 'America/New_York'::text,
  default_trial_days integer NOT NULL DEFAULT 14,
  support_sla_minutes integer NOT NULL DEFAULT 60,
  live_chat_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  merchant_banner text,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  category_id uuid,
  sku text,
  barcode text,
  name text NOT NULL,
  description text,
  brand text,
  supplier text,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  stock numeric(12,3) NOT NULL DEFAULT 0,
  min_stock numeric(12,3) NOT NULL DEFAULT 0,
  max_stock numeric(12,3),
  unit text NOT NULL DEFAULT 'each'::text,
  track_inventory boolean NOT NULL DEFAULT true,
  is_favorite boolean NOT NULL DEFAULT false,
  image_url text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  images text[] NOT NULL DEFAULT '{}'::text[],
  age_restricted boolean NOT NULL DEFAULT false,
  min_age smallint,
  age_category text
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  email text,
  avatar_url text,
  store_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text,
  last_name text,
  phone text,
  employee_id text,
  status text NOT NULL DEFAULT 'active'::text,
  must_change_password boolean NOT NULL DEFAULT false,
  pin_hash text,
  photo_url text,
  hire_date date,
  hourly_wage numeric(10,2),
  scheduled_start_time text,
  scheduled_end_time text,
  late_threshold_minutes integer NOT NULL DEFAULT 5,
  must_change_pin boolean NOT NULL DEFAULT false,
  preferred_language text,
  preferred_locale text,
  pin_fingerprint text
);

CREATE TABLE public.refund_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL,
  sale_item_id uuid,
  product_id uuid,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  restock boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.refunds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  store_id uuid,
  cashier_id uuid,
  approver_id uuid,
  refund_type text NOT NULL DEFAULT 'partial'::text,
  reason text NOT NULL DEFAULT 'other'::text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'cash'::payment_method,
  status text NOT NULL DEFAULT 'completed'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.register_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  closed_by uuid,
  terminal_id uuid,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  expected_cash numeric,
  cash_sales numeric NOT NULL DEFAULT 0,
  cash_refunds numeric NOT NULL DEFAULT 0,
  variance numeric,
  status text NOT NULL DEFAULT 'open'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  safe_drop_amount numeric NOT NULL DEFAULT 0,
  approver_id uuid,
  close_notes text,
  denominations jsonb
);

CREATE TABLE public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  store_id uuid NOT NULL
);

CREATE TABLE public.sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  store_id uuid NOT NULL,
  method text NOT NULL,
  amount numeric NOT NULL,
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'completed'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid,
  cashier_id uuid,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'cash'::payment_method,
  amount_tendered numeric(12,2),
  change_due numeric(12,2),
  status text NOT NULL DEFAULT 'completed'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  receipt_number bigint,
  refunded_amount numeric NOT NULL DEFAULT 0,
  refund_status text NOT NULL DEFAULT 'none'::text,
  customer_name text,
  terminal_ref text,
  register_session_id uuid,
  customer_phone text,
  customer_email text,
  idempotency_key text,
  synced_from_offline boolean NOT NULL DEFAULT false,
  offline_created_at timestamp with time zone,
  customer_id uuid,
  order_type text NOT NULL DEFAULT 'retail'::text,
  table_label text,
  guest_count integer,
  kitchen_status text NOT NULL DEFAULT 'not_required'::text,
  external_order_ref text
);

CREATE TABLE public.signup_risk_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  store_id uuid,
  event_type text NOT NULL,
  ip_hash text NOT NULL,
  email_hash text,
  business_fingerprint text,
  user_agent_hash text,
  country_code text,
  risk_score integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  sale_id uuid,
  sent_by uuid,
  provider text NOT NULL,
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  message_body text,
  idempotency_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_settings (
  store_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'twilio'::text,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  sender_id text,
  default_country text NOT NULL DEFAULT 'US'::text,
  enabled boolean NOT NULL DEFAULT false,
  last_status text,
  last_checked_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.stores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  tax_rate numeric(5,4) NOT NULL DEFAULT 0.0825,
  currency text NOT NULL DEFAULT 'USD'::text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  receipt_header text,
  receipt_footer text DEFAULT 'Thank you for your business!'::text,
  return_policy text DEFAULT 'Returns accepted within 14 days with receipt.'::text,
  email text,
  business_type text,
  city text,
  state text,
  zip text,
  country text DEFAULT 'US'::text,
  website text,
  tax_id text,
  language text DEFAULT 'en'::text,
  time_zone text DEFAULT 'America/New_York'::text,
  date_format text DEFAULT 'MM/DD/YYYY'::text,
  business_hours jsonb DEFAULT '{}'::jsonb,
  setup_completed_at timestamp with time zone,
  setup_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency_symbol text,
  tax_inclusive boolean NOT NULL DEFAULT false,
  receipt_logo_url text,
  thank_you_message text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_verification_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  country_code text,
  region_code text,
  locale text,
  paper_size text,
  address_format_override jsonb,
  phone_format_override text,
  plan_tier text NOT NULL DEFAULT 'trial_pro'::text,
  trial_ends_at timestamp with time zone,
  plan_status text NOT NULL DEFAULT 'trialing'::text,
  plan_period_end timestamp with time zone,
  plan_cancel_at_period_end boolean DEFAULT false,
  store_code text,
  starting_cash_float numeric NOT NULL DEFAULT 100,
  show_expected_before_count boolean NOT NULL DEFAULT false,
  variance_alert_threshold numeric NOT NULL DEFAULT 5,
  suspended_at timestamp with time zone,
  suspended_reason text,
  admin_notes text,
  allow_cashier_quick_add boolean NOT NULL DEFAULT false,
  pos_display_name text,
  business_fingerprint text,
  business_verification_status text NOT NULL DEFAULT 'pending'::text,
  trial_eligibility text NOT NULL DEFAULT 'pending'::text
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stripe_subscription_id text,
  stripe_customer_id text
);

CREATE TABLE public.support_ticket_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  author_id uuid,
  author_email text,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_number bigint NOT NULL DEFAULT nextval('support_tickets_ticket_number_seq'::regclass),
  store_id uuid,
  requester_id uuid,
  requester_email text,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general'::text,
  priority text NOT NULL DEFAULT 'normal'::text,
  status text NOT NULL DEFAULT 'open'::text,
  assigned_admin_id uuid,
  resolution text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  closed_at timestamp with time zone,
  claimed_at timestamp with time zone,
  chat_status text NOT NULL DEFAULT 'waiting'::text,
  chat_ended_at timestamp with time zone,
  chat_ended_by uuid,
  last_message_at timestamp with time zone,
  first_response_at timestamp with time zone,
  last_admin_read_at timestamp with time zone,
  last_merchant_read_at timestamp with time zone,
  resolution_summary text,
  resolution_code text
);

CREATE TABLE public.suppressed_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid,
  clock_in timestamp with time zone NOT NULL DEFAULT now(),
  clock_out timestamp with time zone,
  break_start timestamp with time zone,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  late boolean NOT NULL DEFAULT false,
  late_minutes integer NOT NULL DEFAULT 0,
  approved_by uuid,
  override_reason text
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  store_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- SECTION: CONSTRAINTS (primary keys, unique, check)
ALTER TABLE public.admin_login_attempts ADD CONSTRAINT admin_login_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_permissions ADD CONSTRAINT admin_permissions_pkey PRIMARY KEY (role, permission);
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_pkey PRIMARY KEY (id);
ALTER TABLE public.api_rate_limit_buckets ADD CONSTRAINT api_rate_limit_buckets_pkey PRIMARY KEY (key_hash);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_pkey PRIMARY KEY (id);
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.country_profiles ADD CONSTRAINT country_profiles_pkey PRIMARY KEY (country_code);
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);
ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_pkey PRIMARY KEY (id);
ALTER TABLE public.passkey_challenges ADD CONSTRAINT passkey_challenges_pkey PRIMARY KEY (id);
ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_terminals ADD CONSTRAINT payment_terminals_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_pkey PRIMARY KEY (id);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id);
ALTER TABLE public.signup_risk_events ADD CONSTRAINT signup_risk_events_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_pkey PRIMARY KEY (store_id);
ALTER TABLE public.stores ADD CONSTRAINT stores_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.support_ticket_notes ADD CONSTRAINT support_ticket_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_business_fingerprint_key UNIQUE (business_fingerprint);
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_code_hash_key UNIQUE (code_hash);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_policy_version_unique UNIQUE (user_id, store_id, terms_version, privacy_version);
ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_credential_id_key UNIQUE (credential_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_employee_id_key UNIQUE (employee_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_store_role_permission_key UNIQUE (store_id, role, permission);
ALTER TABLE public.stores ADD CONSTRAINT stores_store_code_key UNIQUE (store_code);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_store_id_key UNIQUE (user_id, role, store_id);
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_client_capability_check CHECK (((client_capability IS NULL) OR (client_capability = ANY (ARRAY['web_screen_share'::text, 'android_diagnostics_only'::text, 'android_screen_share'::text]))));
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'ended'::text, 'expired'::text])));
ALTER TABLE public.api_rate_limit_buckets ADD CONSTRAINT api_rate_limit_buckets_request_count_check CHECK ((request_count >= 0));
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'trial_active'::text, 'trial_used'::text, 'paid'::text, 'blocked'::text, 'review'::text])));
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_type_check CHECK ((type = ANY (ARRAY['payout'::text, 'deposit'::text, 'safe_drop'::text])));
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])));
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])));
ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_id_check CHECK ((id = 1));
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_privacy_version_check CHECK ((btrim(privacy_version) <> ''::text));
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_source_check CHECK ((source = ANY (ARRAY['signup'::text, 'setup_wizard'::text, 'policy_update'::text])));
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_terms_version_check CHECK ((btrim(terms_version) <> ''::text));
ALTER TABLE public.passkey_challenges ADD CONSTRAINT passkey_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['registration'::text, 'authentication'::text])));
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_default_trial_days_check CHECK (((default_trial_days >= 1) AND (default_trial_days <= 90)));
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_support_sla_minutes_check CHECK (((support_sla_minutes >= 5) AND (support_sla_minutes <= 10080)));
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_amount_check CHECK ((amount >= (0)::numeric));
ALTER TABLE public.stores ADD CONSTRAINT stores_business_verification_status_check CHECK ((business_verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'review'::text, 'rejected'::text])));
ALTER TABLE public.stores ADD CONSTRAINT stores_trial_eligibility_check CHECK ((trial_eligibility = ANY (ARRAY['pending'::text, 'eligible'::text, 'used'::text, 'blocked'::text, 'review'::text])));
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_chat_status_check CHECK ((chat_status = ANY (ARRAY['waiting'::text, 'active'::text, 'ended'::text])));
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])));

-- SECTION: FOREIGN KEYS
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_support_sessions ADD CONSTRAINT admin_support_sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_manager_override_id_fkey FOREIGN KEY (manager_override_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.age_verifications ADD CONSTRAINT age_verifications_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_first_store_id_fkey FOREIGN KEY (first_store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.business_trial_registry ADD CONSTRAINT business_trial_registry_first_user_id_fkey FOREIGN KEY (first_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_register_session_id_fkey FOREIGN KEY (register_session_id) REFERENCES register_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.categories ADD CONSTRAINT categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD CONSTRAINT customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_consumed_device_id_fkey FOREIGN KEY (consumed_device_id) REFERENCES device_registrations(id) ON DELETE SET NULL;
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.device_pairing_codes ADD CONSTRAINT device_pairing_codes_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_paired_by_fkey FOREIGN KEY (paired_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.device_registrations ADD CONSTRAINT device_registrations_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.passkey_challenges ADD CONSTRAINT passkey_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_attempted_by_fkey FOREIGN KEY (attempted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.payment_terminals ADD CONSTRAINT payment_terminals_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE;
ALTER TABLE public.refund_items ADD CONSTRAINT refund_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE SET NULL;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES auth.users(id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.sale_payments ADD CONSTRAINT sale_payments_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD CONSTRAINT sales_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_register_session_id_fkey FOREIGN KEY (register_session_id) REFERENCES register_sessions(id);
ALTER TABLE public.sales ADD CONSTRAINT sales_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.signup_risk_events ADD CONSTRAINT signup_risk_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.signup_risk_events ADD CONSTRAINT signup_risk_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sms_send_log ADD CONSTRAINT sms_send_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.stores ADD CONSTRAINT stores_country_code_fkey FOREIGN KEY (country_code) REFERENCES country_profiles(country_code);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.support_ticket_notes ADD CONSTRAINT support_ticket_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_ticket_notes ADD CONSTRAINT support_ticket_notes_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_assigned_admin_id_fkey FOREIGN KEY (assigned_admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_chat_ended_by_fkey FOREIGN KEY (chat_ended_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- SECTION: INDEXES
CREATE INDEX IF NOT EXISTS admin_support_sessions_admin_idx ON public.admin_support_sessions USING btree (admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_support_sessions_channel_token_idx ON public.admin_support_sessions USING btree (channel_token);
CREATE INDEX IF NOT EXISTS admin_support_sessions_store_idx ON public.admin_support_sessions USING btree (store_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_support_sessions_store_status_idx ON public.admin_support_sessions USING btree (store_id, status) WHERE (status = ANY (ARRAY['pending'::text, 'active'::text]));
CREATE INDEX IF NOT EXISTS age_verifications_store_created_idx ON public.age_verifications USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_scope_idx ON public.api_rate_limit_buckets USING btree (scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_updated_idx ON public.api_rate_limit_buckets USING btree (updated_at);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log USING btree (action);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log USING btree (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);
CREATE UNIQUE INDEX cash_movements_idempotency_key_uidx ON public.cash_movements USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON public.cash_movements USING btree (register_session_id);
CREATE INDEX IF NOT EXISTS cash_movements_store_idx ON public.cash_movements USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_store_email_idx ON public.customers USING btree (store_id, lower(email));
CREATE INDEX IF NOT EXISTS customers_store_id_idx ON public.customers USING btree (store_id);
CREATE INDEX IF NOT EXISTS customers_store_phone_idx ON public.customers USING btree (store_id, phone);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time ON public.admin_login_attempts USING btree (lower(email), attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_trial_registry_status ON public.business_trial_registry USING btree (status);
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_store ON public.device_pairing_codes USING btree (store_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_device_registrations_store ON public.device_registrations USING btree (store_id, status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log USING btree (message_id);
CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);
CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expiry ON public.passkey_challenges USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON public.passkey_credentials USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products USING btree (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products USING btree (sku);
CREATE INDEX IF NOT EXISTS idx_products_store ON public.products USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_created ON public.sales USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_risk_business ON public.signup_risk_events USING btree (business_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_risk_ip_time ON public.signup_risk_events USING btree (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stores_business_fingerprint ON public.stores USING btree (business_fingerprint);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON public.subscriptions USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions USING btree (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions USING btree (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);
CREATE INDEX IF NOT EXISTS legal_acceptances_store_recorded_idx ON public.legal_acceptances USING btree (store_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS payment_attempts_created_at_idx ON public.payment_attempts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS role_permissions_store_idx ON public.role_permissions USING btree (store_id);
CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx ON public.sale_payments USING btree (sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_store_id_idx ON public.sale_payments USING btree (store_id);
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON public.sales USING btree (customer_id);
CREATE INDEX IF NOT EXISTS sales_external_order_ref_idx ON public.sales USING btree (external_order_ref);
CREATE UNIQUE INDEX sales_idempotency_key_uidx ON public.sales USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX sales_receipt_number_key ON public.sales USING btree (receipt_number);
CREATE INDEX IF NOT EXISTS sales_register_session_id_idx ON public.sales USING btree (register_session_id);
CREATE UNIQUE INDEX sms_send_log_idem_idx ON public.sms_send_log USING btree (store_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS sms_send_log_store_created_idx ON public.sms_send_log USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_notes_ticket_idx ON public.support_ticket_notes USING btree (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_tickets_chat_activity_idx ON public.support_tickets USING btree (chat_status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON public.support_tickets USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets USING btree (status);
CREATE INDEX IF NOT EXISTS support_tickets_store_idx ON public.support_tickets USING btree (store_id);
CREATE UNIQUE INDEX time_entries_one_open_per_user ON public.time_entries USING btree (user_id) WHERE (clock_out IS NULL);
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON public.time_entries USING btree (user_id, clock_in DESC);
CREATE UNIQUE INDEX uq_profiles_store_pin_fingerprint ON public.profiles USING btree (store_id, pin_fingerprint) WHERE ((status = 'active'::text) AND (pin_fingerprint IS NOT NULL));

-- SECTION: TRIGGERS
CREATE TRIGGER seza_write_limit_cash_movements BEFORE INSERT OR DELETE OR UPDATE ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('120', '3600', '600');
CREATE TRIGGER seza_write_limit_categories BEFORE INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('300', '3600', '300');
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_customers BEFORE INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('600', '3600', '300');
CREATE TRIGGER device_registrations_protect_secret BEFORE INSERT OR UPDATE ON public.device_registrations FOR EACH ROW EXECUTE FUNCTION tg_device_registrations_protect_secret();
CREATE TRIGGER device_registrations_updated_at BEFORE UPDATE ON public.device_registrations FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_legal_acceptances BEFORE INSERT OR DELETE OR UPDATE ON public.legal_acceptances FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('20', '3600', '3600');
CREATE TRIGGER payment_terminals_updated_at BEFORE UPDATE ON public.payment_terminals FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_products BEFORE INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('2000', '3600', '300');
CREATE TRIGGER profiles_prevent_privileged_self_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_profiles_prevent_privileged_self_update();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER refund_items_restock AFTER INSERT ON public.refund_items FOR EACH ROW EXECUTE FUNCTION tg_restock_on_refund();
CREATE TRIGGER refunds_update_sale AFTER INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION tg_update_sale_refund_totals();
CREATE TRIGGER seza_write_limit_refunds BEFORE INSERT OR DELETE OR UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('60', '3600', '1800');
CREATE TRIGGER register_sessions_updated_at BEFORE UPDATE ON public.register_sessions FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER sale_items_decrement_stock AFTER INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION tg_decrement_stock_on_sale();
CREATE TRIGGER sale_payments_set_updated_at BEFORE UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER sales_assign_receipt BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION tg_assign_receipt_number();
CREATE TRIGGER sms_settings_set_updated_at BEFORE UPDATE ON public.sms_settings FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_prepare_new_store_trial_trigger BEFORE INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION seza_prepare_new_store_trial();
CREATE TRIGGER stores_prevent_platform_field_writes BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION tg_stores_prevent_platform_field_writes();
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER trg_subscription_recompute AFTER INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION tg_subscription_recompute();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER seza_write_limit_support_ticket_notes BEFORE INSERT OR DELETE OR UPDATE ON public.support_ticket_notes FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('120', '3600', '600');
CREATE TRIGGER seza_write_limit_support_tickets BEFORE INSERT OR DELETE OR UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('5', '3600', '3600');
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER tg_support_tickets_assign_number BEFORE INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION tg_assign_ticket_number();
CREATE TRIGGER seza_write_limit_time_entries BEFORE INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION enforce_authenticated_write_rate_limit('240', '3600', '600');
CREATE TRIGGER time_entries_prevent_privileged_self_update BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION tg_time_entries_prevent_privileged_self_update();
CREATE TRIGGER trg_time_entries_compute_late BEFORE INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION tg_time_entries_compute_late();
CREATE TRIGGER trg_enforce_role_exclusivity BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_enforce_role_exclusivity();
CREATE TRIGGER trg_protect_super_admin BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_protect_super_admin_role();
CREATE TRIGGER user_roles_protect_last_owner BEFORE DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION tg_user_roles_protect_last_owner();

-- SECTION: FUNCTIONS PART 1
CREATE OR REPLACE FUNCTION public.activate_verified_business_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.admin_global_search(_q text, _limit integer DEFAULT 25)
 RETURNS TABLE(kind text, id uuid, store_id uuid, label text, sublabel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q text := lower(coalesce(_q, ''));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'store'::text, s.id, s.id,
           s.name,
           coalesce(s.email, s.store_code, s.city, '')::text
    FROM public.stores s
    WHERE lower(s.name) LIKE '%'||q||'%'
       OR lower(coalesce(s.store_code,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(s.phone,'')) LIKE '%'||q||'%'
       OR s.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'owner'::text, p.id, p.store_id,
           coalesce(p.full_name, p.email, '(no name)')::text,
           coalesce(p.email, p.phone, '')::text
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('owner'::app_role, 'admin'::app_role)
    WHERE lower(coalesce(p.full_name,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.email,'')) LIKE '%'||q||'%'
       OR lower(coalesce(p.phone,'')) LIKE '%'||q||'%'
       OR p.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'terminal'::text, t.id, t.store_id,
           t.label,
           coalesce(t.serial, t.provider, '')::text
    FROM public.payment_terminals t
    WHERE lower(t.label) LIKE '%'||q||'%'
       OR lower(coalesce(t.serial,'')) LIKE '%'||q||'%'
       OR t.id::text = q
    LIMIT _limit;

  RETURN QUERY
    SELECT 'subscription'::text, sub.id, sub.store_id,
           coalesce(sub.stripe_subscription_id, sub.id::text),
           coalesce(sub.status, '')::text
    FROM public.subscriptions sub
    WHERE lower(coalesce(sub.stripe_subscription_id,'')) LIKE '%'||q||'%'
       OR lower(coalesce(sub.stripe_customer_id,'')) LIKE '%'||q||'%'
       OR sub.id::text = q
    LIMIT _limit;
END $function$
;

CREATE OR REPLACE FUNCTION public.can_manage_employee(_actor uuid, _target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_store uuid;
  v_target_store uuid;
  v_actor_roles text[];
  v_target_roles text[];
BEGIN
  IF _actor IS NULL OR _target IS NULL THEN RETURN false; END IF;

  SELECT store_id INTO v_actor_store  FROM public.profiles WHERE id = _actor;
  SELECT store_id INTO v_target_store FROM public.profiles WHERE id = _target;
  IF v_actor_store IS NULL OR v_target_store IS NULL
     OR v_actor_store <> v_target_store THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_actor_roles FROM public.user_roles
    WHERE user_id = _actor AND store_id = v_actor_store;
  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_target_roles FROM public.user_roles
    WHERE user_id = _target AND store_id = v_target_store;

  -- Never allow anyone to manage a platform-staff account through this path.
  IF v_target_roles && ARRAY[
    'super_admin','operations_admin','support_admin','billing_admin','analyst',
    'technical_support','merchant_support','compliance_support','billing_support',
    'read_only_auditor'
  ] THEN
    RETURN false;
  END IF;

  IF 'owner' = ANY(v_actor_roles) THEN
    -- Owner may manage anyone but must not act on themselves for
    -- role/removal (checked at call site via is_last_owner).
    RETURN true;
  END IF;

  IF 'admin' = ANY(v_actor_roles) THEN
    -- Admin may manage admin/manager/cashier, not owner.
    RETURN NOT ('owner' = ANY(v_target_roles));
  END IF;

  IF 'manager' = ANY(v_actor_roles) THEN
    -- Manager may only touch cashiers (never themselves, another manager,
    -- an admin, or an owner).
    IF _actor = _target THEN RETURN false; END IF;
    RETURN NOT (
      'owner'   = ANY(v_target_roles)
      OR 'admin'   = ANY(v_target_roles)
      OR 'manager' = ANY(v_target_roles)
    );
  END IF;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limit_buckets()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.api_rate_limit_buckets
  WHERE updated_at < now() - interval '7 days'
    AND (blocked_until IS NULL OR blocked_until < now() - interval '1 day');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(p_key_hash text, p_scope text, p_limit integer, p_window_seconds integer, p_block_seconds integer DEFAULT 0)
 RETURNS TABLE(allowed boolean, remaining integer, retry_after_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket public.api_rate_limit_buckets%ROWTYPE;
  v_window interval;
  v_block interval;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 OR length(p_key_hash) > 128 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_scope IS NULL OR length(btrim(p_scope)) = 0 OR length(p_scope) > 120 THEN
    RAISE EXCEPTION 'Invalid rate-limit scope';
  END IF;
  IF p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid rate-limit maximum';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  IF p_block_seconds < 0 OR p_block_seconds > 604800 THEN
    RAISE EXCEPTION 'Invalid rate-limit block duration';
  END IF;

  v_window := make_interval(secs => p_window_seconds);
  v_block := make_interval(secs => p_block_seconds);

  INSERT INTO public.api_rate_limit_buckets (
    key_hash, scope, window_started_at, request_count, blocked_until, updated_at
  ) VALUES (
    p_key_hash, p_scope, v_now, 0, NULL, v_now
  )
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_bucket
  FROM public.api_rate_limit_buckets
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF v_bucket.blocked_until IS NOT NULL AND v_bucket.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0,
      GREATEST(1, ceil(extract(epoch FROM (v_bucket.blocked_until - v_now)))::integer);
    RETURN;
  END IF;

  IF v_bucket.window_started_at + v_window <= v_now THEN
    UPDATE public.api_rate_limit_buckets
    SET scope = p_scope,
        window_started_at = v_now,
        request_count = 1,
        blocked_until = NULL,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT true, GREATEST(0, p_limit - 1), 0;
    RETURN;
  END IF;

  IF v_bucket.request_count >= p_limit THEN
    UPDATE public.api_rate_limit_buckets
    SET blocked_until = CASE
          WHEN p_block_seconds > 0 THEN v_now + v_block
          ELSE v_bucket.window_started_at + v_window
        END,
        updated_at = v_now
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT false, 0,
      GREATEST(
        1,
        ceil(extract(epoch FROM (
          CASE WHEN p_block_seconds > 0 THEN v_now + v_block
               ELSE v_bucket.window_started_at + v_window END
          - v_now
        )))::integer
      );
    RETURN;
  END IF;

  UPDATE public.api_rate_limit_buckets
  SET scope = p_scope,
      request_count = request_count + 1,
      blocked_until = NULL,
      updated_at = v_now
  WHERE key_hash = p_key_hash
  RETURNING * INTO v_bucket;

  RETURN QUERY SELECT true, GREATEST(0, p_limit - v_bucket.request_count), 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_store_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT store_id FROM public.profiles WHERE id = auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_for_employee_id(p_employee_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT email
    FROM public.profiles
   WHERE employee_id = p_employee_id
     AND status = 'active'
   LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://project--4374087d-5dc0-48d9-acd8-edf012865fdf.lovable.app/lovable/email/queue/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://project--4374087d-5dc0-48d9-acd8-edf012865fdf.lovable.app/lovable/email/queue/process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_authenticated_write_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_limit integer := TG_ARGV[0]::integer;
  v_window integer := TG_ARGV[1]::integer;
  v_block integer := TG_ARGV[2]::integer;
  v_key text;
  v_allowed boolean;
  v_remaining integer;
  v_retry integer;
BEGIN
  -- Service-role/internal work has no auth.uid() and is already protected by
  -- the server endpoint that invoked it.
  IF v_actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_key := encode(
    digest(v_actor::text || ':' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || TG_OP, 'sha256'),
    'hex'
  );

  SELECT allowed, remaining, retry_after_seconds
    INTO v_allowed, v_remaining, v_retry
  FROM public.consume_api_rate_limit(
    v_key,
    'db.write.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    v_limit,
    v_window,
    v_block
  );

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'RATE_LIMITED',
      DETAIL = 'retry_after_seconds=' || GREATEST(1, COALESCE(v_retry, 1));
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_sale_id uuid;
  v_idempotency_key text;
  v_sale public.sales%ROWTYPE;
  v_created boolean := false;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_existing_items integer := 0;
  v_existing_payments integer := 0;
  v_items_total numeric := 0;
  v_payments_total numeric := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'p_sale must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A sale must contain at least one item' USING ERRCODE = '23514';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'p_payments must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_store_id := NULLIF(p_sale->>'store_id', '')::uuid;
  IF v_store_id IS NULL OR v_store_id IS DISTINCT FROM public.current_store_id() THEN
    RAISE EXCEPTION 'Sale store does not match the authenticated user store' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_user_id, 'sales.create') THEN
    RAISE EXCEPTION 'User does not have sales.create permission' USING ERRCODE = '42501';
  END IF;

  v_sale_id := COALESCE(NULLIF(p_sale->>'id', '')::uuid, gen_random_uuid());
  v_idempotency_key := NULLIF(btrim(p_sale->>'idempotency_key'), '');
  v_subtotal := COALESCE((p_sale->>'subtotal')::numeric, 0);
  v_tax := COALESCE((p_sale->>'tax')::numeric, 0);
  v_discount := COALESCE((p_sale->>'discount')::numeric, 0);
  v_total := COALESCE((p_sale->>'total')::numeric, 0);

  IF v_subtotal < 0 OR v_tax < 0 OR v_discount < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'Sale monetary values cannot be negative' USING ERRCODE = '23514';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Sale discount cannot exceed subtotal' USING ERRCODE = '23514';
  END IF;
  IF abs(v_total - (v_subtotal - v_discount + v_tax)) > 0.01 THEN
    RAISE EXCEPTION 'Sale total does not match subtotal, discount, and tax' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(p_sale->>'register_session_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.register_sessions
    WHERE id = (p_sale->>'register_session_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Register session does not belong to this store' USING ERRCODE = '23503';
  END IF;
  IF NULLIF(p_sale->>'customer_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = (p_sale->>'customer_id')::uuid AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this store' USING ERRCODE = '23503';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Sale item quantity must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE((v_item->>'unit_price')::numeric, -1) < 0
       OR COALESCE((v_item->>'line_total')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Sale item prices cannot be negative' USING ERRCODE = '23514';
    END IF;
    IF abs(
      (v_item->>'line_total')::numeric
      - ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric)
    ) > 0.01 THEN
      RAISE EXCEPTION 'Sale item line total is invalid' USING ERRCODE = '23514';
    END IF;
    v_items_total := v_items_total + (v_item->>'line_total')::numeric;
    IF NULLIF(btrim(v_item->>'product_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Sale item product_name is required' USING ERRCODE = '23502';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'Product % does not belong to this store', v_product_id USING ERRCODE = '23503';
    END IF;
  END LOOP;

  IF abs(v_items_total - v_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'Sale items do not match subtotal' USING ERRCODE = '23514';
  END IF;

  PERFORM p.id
  FROM public.products p
  JOIN (
    SELECT
      NULLIF(item->>'product_id', '')::uuid AS product_id,
      sum((item->>'quantity')::numeric) AS quantity
    FROM jsonb_array_elements(p_items) AS rows(item)
    WHERE NULLIF(item->>'product_id', '') IS NOT NULL
    GROUP BY NULLIF(item->>'product_id', '')::uuid
  ) requested ON requested.product_id = p.id
  WHERE p.store_id = v_store_id
  ORDER BY p.id
  FOR UPDATE OF p;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN (
      SELECT
        NULLIF(item->>'product_id', '')::uuid AS product_id,
        sum((item->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_items) AS rows(item)
      WHERE NULLIF(item->>'product_id', '') IS NOT NULL
      GROUP BY NULLIF(item->>'product_id', '')::uuid
    ) requested ON requested.product_id = p.id
    WHERE p.store_id = v_store_id
      AND p.track_inventory
      AND p.stock < requested.quantity
  ) THEN
    RAISE EXCEPTION 'Insufficient inventory for one or more products' USING ERRCODE = '23514';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF COALESCE((v_payment->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_payment->>'method', '') NOT IN ('cash','card','tap_to_pay','manual_card','gift_card','other') THEN
      RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '23514';
    END IF;
    v_payments_total := v_payments_total + (v_payment->>'amount')::numeric;
  END LOOP;
  IF v_total > 0 AND jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'A paid sale must include a payment allocation' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_payments) > 0 AND abs(v_payments_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Payment allocations do not match sale total' USING ERRCODE = '23514';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE idempotency_key = v_idempotency_key LIMIT 1;
  END IF;
  IF v_sale.id IS NULL THEN
    SELECT * INTO v_sale FROM public.sales WHERE id = v_sale_id LIMIT 1;
  END IF;

  IF v_sale.id IS NULL THEN
    BEGIN
      INSERT INTO public.sales (
        id, store_id, cashier_id, subtotal, tax, discount, total, payment_method,
        amount_tendered, change_due, terminal_ref, register_session_id, status,
        customer_name, idempotency_key, synced_from_offline, offline_created_at,
        customer_id, order_type, table_label, guest_count, kitchen_status, external_order_ref
      ) VALUES (
        v_sale_id, v_store_id, v_user_id, v_subtotal, v_tax, v_discount, v_total,
        COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash')::public.payment_method,
        NULLIF(p_sale->>'amount_tendered', '')::numeric,
        NULLIF(p_sale->>'change_due', '')::numeric,
        NULLIF(p_sale->>'terminal_ref', ''),
        NULLIF(p_sale->>'register_session_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'status', ''), 'completed'),
        NULLIF(p_sale->>'customer_name', ''),
        v_idempotency_key,
        COALESCE((p_sale->>'synced_from_offline')::boolean, false),
        NULLIF(p_sale->>'offline_created_at', '')::timestamptz,
        NULLIF(p_sale->>'customer_id', '')::uuid,
        COALESCE(NULLIF(p_sale->>'order_type', ''), 'retail'),
        NULLIF(p_sale->>'table_label', ''),
        NULLIF(p_sale->>'guest_count', '')::integer,
        COALESCE(NULLIF(p_sale->>'kitchen_status', ''), 'not_required'),
        NULLIF(p_sale->>'external_order_ref', '')
      )
      RETURNING * INTO v_sale;
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_sale
      FROM public.sales
      WHERE id = v_sale_id
         OR (v_idempotency_key IS NOT NULL AND idempotency_key = v_idempotency_key)
      ORDER BY (idempotency_key = v_idempotency_key) DESC NULLS LAST
      LIMIT 1;
      IF v_sale.id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF v_sale.store_id IS DISTINCT FROM v_store_id OR v_sale.cashier_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another sale context' USING ERRCODE = '42501';
  END IF;
  IF abs(v_sale.subtotal - v_subtotal) > 0.01
     OR abs(v_sale.tax - v_tax) > 0.01
     OR abs(v_sale.discount - v_discount) > 0.01
     OR abs(v_sale.total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Idempotency key payload does not match the original sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_items FROM public.sale_items WHERE sale_id = v_sale.id;
  IF v_existing_items = 0 THEN
    INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
    SELECT v_sale.id,
      NULLIF(item->>'product_id', '')::uuid,
      item->>'product_name',
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'line_total')::numeric
    FROM jsonb_array_elements(p_items) AS rows(item);
  ELSIF v_created THEN
    RAISE EXCEPTION 'Unexpected sale item state for newly created sale' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_existing_payments FROM public.sale_payments WHERE sale_id = v_sale.id;
  IF v_existing_payments = 0 AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
    LOOP
      INSERT INTO public.sale_payments (sale_id, store_id, method, amount, provider, provider_reference, status, metadata)
      VALUES (
        v_sale.id, v_store_id,
        v_payment->>'method',
        (v_payment->>'amount')::numeric,
        NULLIF(v_payment->>'provider', ''),
        NULLIF(v_payment->>'provider_reference', ''),
        COALESCE(NULLIF(v_payment->>'status', ''), 'completed'),
        COALESCE(v_payment->'metadata', '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'receipt_number', v_sale.receipt_number,
    'created_at', v_sale.created_at,
    'store_id', v_sale.store_id,
    'already_existed', NOT v_created
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_employee_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id text;
BEGIN
  LOOP
    new_id := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id = new_id);
  END LOOP;
  RETURN new_id;
END
$function$
;

CREATE OR REPLACE FUNCTION public.generate_store_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

-- SECTION: FUNCTIONS PART 2
CREATE OR REPLACE FUNCTION public.has_active_plan(_store_id uuid, _min_tier text DEFAULT 'starter'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id
       AND plan_status IN ('active','trialing','past_due')
       AND public.tier_rank(plan_tier) >= public.tier_rank(_min_tier)
       AND (plan_period_end IS NULL OR plan_period_end > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- super_admin always wins
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.admin_permissions ap
        ON ap.role = ur.role::text
      WHERE ur.user_id = _user_id
        AND (ap.permission = _permission OR ap.permission = '*')
    );
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
     AND rp.store_id = ur.store_id
    WHERE ur.user_id = _user_id
      AND ur.store_id = public.current_store_id()
      AND (rp.permission = _permission OR rp.permission = '*')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('owner'::app_role, 'admin'::app_role)
      )
    THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END
$function$
;

CREATE OR REPLACE FUNCTION public.is_last_owner(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'owner'::app_role
      AND (
        SELECT count(*)
        FROM public.user_roles ur2
        WHERE ur2.role = 'owner'::app_role
          AND ur2.store_id = ur.store_id
      ) <= 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'super_admin',
        'operations_admin',
        'support_admin',
        'billing_admin',
        'analyst',
        'technical_support',
        'merchant_support',
        'compliance_support'
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_read_only(_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id
       AND plan_status IN ('active','trialing','past_due')
       AND (plan_period_end IS NULL OR plan_period_end > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _subject text DEFAULT NULL::text)
 RETURNS support_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_active boolean;
  v_ticket public.support_tickets;
  v_is_priv boolean;
  v_is_requester boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT store_id, (status = 'active') INTO v_store, v_active
    FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_active, false) OR v_store IS NULL THEN
    RAISE EXCEPTION 'Inactive or unassigned employee' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = _ticket_id;
  IF NOT FOUND OR v_ticket.store_id IS DISTINCT FROM v_store THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = '42501';
  END IF;

  v_is_requester := (v_ticket.requester_id = v_uid);
  v_is_priv :=
    public.has_any_role(v_uid, ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])
    OR public.has_permission(v_uid, 'support.manage');

  IF NOT (v_is_requester OR v_is_priv) THEN
    RAISE EXCEPTION 'Not permitted to modify this ticket' USING ERRCODE = '42501';
  END IF;

  -- Cashiers (non-privileged requesters) may not reassign priority.
  IF _priority IS NOT NULL AND NOT v_is_priv THEN
    RAISE EXCEPTION 'Not permitted to change priority' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('open','waiting_support','waiting_for_merchant','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
  END IF;

  IF _priority IS NOT NULL AND _priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority' USING ERRCODE = '22023';
  END IF;

  UPDATE public.support_tickets
     SET status     = COALESCE(_status, status),
         priority   = COALESCE(_priority, priority),
         subject    = COALESCE(NULLIF(btrim(_subject), ''), subject),
         updated_at = now()
   WHERE id = _ticket_id
   RETURNING * INTO v_ticket;

  RETURN v_ticket;
END
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.plan_tier_for_price(_price_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _price_id
    WHEN 'business_monthly' THEN 'business'
    WHEN 'pro_monthly'      THEN 'pro'
    WHEN 'starter_monthly'  THEN 'starter'
    ELSE 'starter'
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_find_pin_candidates(_store_id uuid, _fingerprint text)
 RETURNS TABLE(id uuid, email text, pin_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.email, p.pin_hash
    FROM public.profiles p
   WHERE p.store_id = _store_id
     AND p.status = 'active'
     AND p.pin_fingerprint = _fingerprint
     AND p.pin_hash IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_list_unfingerprinted(_store_id uuid)
 RETURNS TABLE(id uuid, email text, pin_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.email, p.pin_hash
    FROM public.profiles p
   WHERE p.store_id = _store_id
     AND p.status = 'active'
     AND p.pin_hash IS NOT NULL
     AND p.pin_fingerprint IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE store_id = _store_id
      AND status = 'active'
      AND pin_fingerprint = _fingerprint
      AND (_exclude_user IS NULL OR id <> _exclude_user)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_store_plan(_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub RECORD;
  v_trial_ends timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT trial_ends_at INTO v_trial_ends FROM public.stores WHERE id = _store_id;

  SELECT s.* INTO v_sub
    FROM public.subscriptions s
   WHERE s.store_id = _store_id
     AND s.environment = CASE
       WHEN current_setting('app.environment', true) = 'live' THEN 'live'
       ELSE 'sandbox'
     END
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_sub IS NULL THEN
    SELECT s.* INTO v_sub
      FROM public.subscriptions s
     WHERE s.store_id = _store_id
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  IF v_sub.id IS NOT NULL AND (
        v_sub.status IN ('active','trialing','past_due')
        OR (v_sub.status = 'canceled' AND v_sub.current_period_end > v_now)
     ) THEN
    UPDATE public.stores SET
      plan_tier = public.plan_tier_for_price(v_sub.price_id),
      plan_status = v_sub.status,
      plan_period_end = v_sub.current_period_end,
      plan_cancel_at_period_end = COALESCE(v_sub.cancel_at_period_end, false)
    WHERE id = _store_id;
  ELSIF v_trial_ends IS NOT NULL AND v_trial_ends > v_now THEN
    UPDATE public.stores SET
      plan_tier = 'trial_pro',
      plan_status = 'trialing',
      plan_period_end = v_trial_ends,
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  ELSE
    UPDATE public.stores SET
      plan_tier = 'expired',
      plan_status = 'expired',
      plan_period_end = COALESCE(v_sub.current_period_end, v_trial_ends),
      plan_cancel_at_period_end = false
    WHERE id = _store_id;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone DEFAULT now(), p_source text DEFAULT 'setup_wizard'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid := public.current_store_id();
  v_id uuid;
  v_accepted_at timestamptz := COALESCE(p_accepted_at, now());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No active store is assigned' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_terms_version, '')) = ''
     OR btrim(COALESCE(p_privacy_version, '')) = '' THEN
    RAISE EXCEPTION 'Policy versions are required' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('signup', 'setup_wizard', 'policy_update') THEN
    RAISE EXCEPTION 'Invalid legal acceptance source' USING ERRCODE = '22023';
  END IF;
  IF v_accepted_at < now() - interval '24 hours' OR v_accepted_at > now() + interval '5 minutes' THEN
    v_accepted_at := now();
  END IF;

  INSERT INTO public.legal_acceptances (user_id, store_id, terms_version, privacy_version, accepted_at, source)
  VALUES (v_user_id, v_store_id, btrim(p_terms_version), btrim(p_privacy_version), v_accepted_at, p_source)
  ON CONFLICT (user_id, store_id, terms_version, privacy_version) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.legal_acceptances
     WHERE user_id = v_user_id
       AND store_id = v_store_id
       AND terms_version = btrim(p_terms_version)
       AND privacy_version = btrim(p_privacy_version);
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seza_attach_signup_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.seza_prepare_new_store_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.business_fingerprint IS NOT NULL THEN
    NEW.plan_status := 'inactive';
    NEW.trial_ends_at := NULL;
    NEW.plan_period_end := NULL;
    NEW.trial_eligibility := 'pending';
    NEW.business_verification_status := 'pending';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.simulate_trial_expiry(_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.stores
     SET trial_ends_at = now() - interval '1 minute'
   WHERE id = _store_id;
  PERFORM public.recompute_store_plan(_store_id);
END $function$
;

-- SECTION: FUNCTIONS PART 3 (trigger functions)
CREATE OR REPLACE FUNCTION public.tg_assign_receipt_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := nextval('public.receipt_number_seq');
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_assign_ticket_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN IF NEW.ticket_number IS NULL THEN NEW.ticket_number := nextval('public.support_ticket_number_seq'); END IF; RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.tg_decrement_stock_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_device_registrations_protect_secret()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.secret_hash IS NOT NULL THEN
      RAISE EXCEPTION 'Device secrets can only be issued by the pairing service';
    END IF;
  ELSIF NEW.secret_hash IS DISTINCT FROM OLD.secret_hash THEN
    RAISE EXCEPTION 'Device secrets can only be issued by the pairing service';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_enforce_role_exclusivity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_profiles_prevent_privileged_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  self_allowed_change boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> auth.uid() THEN
    -- Non-self edits by non-privileged users are already blocked by the
    -- profiles UPDATE policy; nothing else to do here.
    RETURN NEW;
  END IF;

  -- Self edit: any change outside the safe allowlist is denied.
  self_allowed_change :=
    (NEW.first_name IS NOT DISTINCT FROM OLD.first_name)
    AND (NEW.last_name IS NOT DISTINCT FROM OLD.last_name)
    AND (NEW.full_name IS NOT DISTINCT FROM OLD.full_name)
    AND (NEW.phone IS NOT DISTINCT FROM OLD.phone)
    AND (NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url)
    AND (NEW.preferred_language IS NOT DISTINCT FROM OLD.preferred_language)
    AND (NEW.preferred_locale IS NOT DISTINCT FROM OLD.preferred_locale)
    -- Every other column MUST remain unchanged.
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.pin_hash IS NOT DISTINCT FROM OLD.pin_hash)
    AND (NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id)
    AND (NEW.hourly_wage IS NOT DISTINCT FROM OLD.hourly_wage)
    AND (NEW.scheduled_start_time IS NOT DISTINCT FROM OLD.scheduled_start_time)
    AND (NEW.scheduled_end_time IS NOT DISTINCT FROM OLD.scheduled_end_time)
    AND (NEW.late_threshold_minutes IS NOT DISTINCT FROM OLD.late_threshold_minutes)
    AND (NEW.status IS NOT DISTINCT FROM OLD.status)
    AND (NEW.must_change_password IS NOT DISTINCT FROM OLD.must_change_password)
    AND (NEW.must_change_pin IS NOT DISTINCT FROM OLD.must_change_pin)
    AND (NEW.hire_date IS NOT DISTINCT FROM OLD.hire_date)
    AND (NEW.email IS NOT DISTINCT FROM OLD.email);

  IF NOT self_allowed_change THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_protect_super_admin_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_touches_super boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_super := (NEW.role::text = 'super_admin');
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_super := (NEW.role::text = 'super_admin' OR OLD.role::text = 'super_admin');
  ELSIF TG_OP = 'DELETE' THEN
    v_touches_super := (OLD.role::text = 'super_admin');
  END IF;

  IF v_touches_super THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform super admins can manage the super_admin role';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_restock_on_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.restock AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock + NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.tg_stores_prevent_platform_field_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
     OR NEW.plan_period_end IS DISTINCT FROM OLD.plan_period_end
     OR NEW.plan_cancel_at_period_end IS DISTINCT FROM OLD.plan_cancel_at_period_end
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.store_code IS DISTINCT FROM OLD.store_code THEN
    RAISE EXCEPTION 'Not allowed to modify platform-controlled store fields';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_subscription_recompute()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.store_id IS NOT NULL THEN
    PERFORM public.recompute_store_plan(NEW.store_id);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_time_entries_compute_late()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sched text;
  v_threshold int;
  v_tz text;
  v_now_local timestamp;
  v_sched_local timestamp;
  v_diff_min int;
BEGIN
  SELECT scheduled_start_time, late_threshold_minutes
    INTO v_sched, v_threshold
    FROM public.profiles WHERE id = NEW.user_id;

  IF v_sched IS NULL OR v_sched = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(time_zone, 'UTC') INTO v_tz
    FROM public.stores WHERE id = NEW.store_id;
  IF v_tz IS NULL THEN v_tz := 'UTC'; END IF;

  v_now_local := (NEW.clock_in AT TIME ZONE v_tz);
  v_sched_local := (date_trunc('day', v_now_local) + v_sched::time);
  v_diff_min := EXTRACT(EPOCH FROM (v_now_local - v_sched_local)) / 60;

  IF v_diff_min > COALESCE(v_threshold, 5) THEN
    NEW.late := true;
    NEW.late_minutes := v_diff_min;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_time_entries_prevent_privileged_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  self_allowed boolean;
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  self_allowed :=
    (NEW.clock_out IS NOT DISTINCT FROM OLD.clock_out OR OLD.clock_out IS NULL)
    AND (NEW.break_start IS NOT DISTINCT FROM OLD.break_start OR OLD.break_start IS NULL)
    AND (NEW.break_end IS NOT DISTINCT FROM OLD.break_end OR OLD.break_end IS NULL)
    AND (NEW.notes IS NOT DISTINCT FROM OLD.notes OR OLD.notes IS NULL OR NEW.notes IS NOT NULL)
    AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
    AND (NEW.store_id IS NOT DISTINCT FROM OLD.store_id)
    AND (NEW.clock_in IS NOT DISTINCT FROM OLD.clock_in)
    AND (NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by)
    AND (NEW.late IS NOT DISTINCT FROM OLD.late)
    AND (NEW.late_minutes IS NOT DISTINCT FROM OLD.late_minutes);

  IF NOT self_allowed THEN
    RAISE EXCEPTION 'Not allowed to modify privileged time entry fields';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_update_sale_refund_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total numeric; v_sale_total numeric;
BEGIN
  SELECT COALESCE(SUM(total),0) INTO v_total FROM public.refunds WHERE sale_id = NEW.sale_id;
  SELECT total INTO v_sale_total FROM public.sales WHERE id = NEW.sale_id;
  UPDATE public.sales SET
    refunded_amount = v_total,
    refund_status = CASE
      WHEN v_total <= 0 THEN 'none'
      WHEN v_total >= v_sale_total THEN 'full'
      ELSE 'partial'
    END,
    status = CASE WHEN NEW.refund_type = 'void' THEN 'voided' ELSE status END
  WHERE id = NEW.sale_id;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_user_roles_protect_last_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid;
  v_user  uuid;
  v_remaining int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role::text <> 'owner' THEN RETURN OLD; END IF;
    v_store := OLD.store_id; v_user := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only care when demoting away from owner.
    IF OLD.role::text = 'owner' AND NEW.role::text <> 'owner' THEN
      v_store := OLD.store_id; v_user := OLD.user_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
    FROM public.user_roles
    WHERE store_id = v_store
      AND role = 'owner'::app_role
      AND user_id <> v_user;

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'Cannot demote or remove the last owner of this business';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tier_rank(_tier text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tier
    WHEN 'business' THEN 3
    WHEN 'pro' THEN 2
    WHEN 'trial_pro' THEN 2
    WHEN 'starter' THEN 1
    ELSE 0
  END;
$function$
;

-- SECTION: ENABLE RLS
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.age_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_trial_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Tables in public WITHOUT row level security enabled (informational):
--   (none)

-- SECTION: RESET AND REGRANT TABLE PRIVILEGES
REVOKE ALL ON TABLE public.admin_login_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_support_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.age_verifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.api_rate_limit_buckets FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.business_trial_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.cash_movements FROM anon, authenticated;
REVOKE ALL ON TABLE public.categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.country_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.customers FROM anon, authenticated;
REVOKE ALL ON TABLE public.device_pairing_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.device_registrations FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_send_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_send_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_unsubscribe_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.legal_acceptances FROM anon, authenticated;
REVOKE ALL ON TABLE public.passkey_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.passkey_credentials FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_terminals FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.products FROM anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.refund_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.refunds FROM anon, authenticated;
REVOKE ALL ON TABLE public.register_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.role_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.sale_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.sale_payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.sales FROM anon, authenticated;
REVOKE ALL ON TABLE public.signup_risk_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_send_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.stores FROM anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_ticket_notes FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_tickets FROM anon, authenticated;
REVOKE ALL ON TABLE public.suppressed_emails FROM anon, authenticated;
REVOKE ALL ON TABLE public.time_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;

-- Table-level grants
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_login_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_support_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_support_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_support_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.age_verifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.age_verifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.age_verifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_rate_limit_buckets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.business_trial_registry TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cash_movements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cash_movements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cash_movements TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.country_profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.country_profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.country_profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.customers TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_pairing_codes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_pairing_codes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_pairing_codes TO service_role;
GRANT DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.device_registrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_registrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.legal_acceptances TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.legal_acceptances TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.legal_acceptances TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_challenges TO service_role;
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_credentials TO anon;
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_credentials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.passkey_credentials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_terminals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_terminals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_terminals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refund_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refund_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refund_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.register_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.register_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.register_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_permissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_permissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_permissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_payments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sale_payments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.signup_risk_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_send_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_send_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_send_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sms_settings TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.stores TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stores TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_ticket_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_ticket_notes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_ticket_notes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.support_tickets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.time_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.time_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.time_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO service_role;

-- Column-level grants (these encode the SEZA privilege-escalation protections)
GRANT INSERT(app_version) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(app_version) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(app_version) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(created_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(id) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(label) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(label) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(label) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(last_seen_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(last_seen_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(last_seen_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(last_sync_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(last_sync_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(last_sync_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(paired_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(paired_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(paired_by) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(paired_by) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(platform) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(platform) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(platform) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(revoke_reason) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(revoke_reason) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(revoke_reason) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(revoked_at) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(revoked_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(revoked_at) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(revoked_by) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(revoked_by) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(revoked_by) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(status) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(status) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(status) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(status_snapshot) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(status_snapshot) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(status_snapshot) ON TABLE public.device_registrations TO authenticated;
GRANT INSERT(store_id) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(store_id) ON TABLE public.device_registrations TO authenticated;
GRANT SELECT(updated_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(updated_at) ON TABLE public.device_registrations TO authenticated;
GRANT UPDATE(avatar_url) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(first_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(full_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(last_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(photo_url) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(preferred_language) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(preferred_locale) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(updated_at) ON TABLE public.profiles TO authenticated;
GRANT SELECT(credentials) ON TABLE public.sms_settings TO service_role;
GRANT UPDATE(address) ON TABLE public.stores TO authenticated;
GRANT UPDATE(address_format_override) ON TABLE public.stores TO authenticated;
GRANT UPDATE(age_verification_settings) ON TABLE public.stores TO authenticated;
GRANT UPDATE(allow_cashier_quick_add) ON TABLE public.stores TO authenticated;
GRANT UPDATE(business_hours) ON TABLE public.stores TO authenticated;
GRANT UPDATE(business_type) ON TABLE public.stores TO authenticated;
GRANT UPDATE(city) ON TABLE public.stores TO authenticated;
GRANT UPDATE(country) ON TABLE public.stores TO authenticated;
GRANT UPDATE(country_code) ON TABLE public.stores TO authenticated;
GRANT UPDATE(currency) ON TABLE public.stores TO authenticated;
GRANT UPDATE(currency_symbol) ON TABLE public.stores TO authenticated;
GRANT UPDATE(date_format) ON TABLE public.stores TO authenticated;
GRANT UPDATE(email) ON TABLE public.stores TO authenticated;
GRANT UPDATE(language) ON TABLE public.stores TO authenticated;
GRANT UPDATE(locale) ON TABLE public.stores TO authenticated;
GRANT UPDATE(logo_url) ON TABLE public.stores TO authenticated;
GRANT UPDATE(name) ON TABLE public.stores TO authenticated;
GRANT UPDATE(paper_size) ON TABLE public.stores TO authenticated;
GRANT UPDATE(phone) ON TABLE public.stores TO authenticated;
GRANT UPDATE(phone_format_override) ON TABLE public.stores TO authenticated;
GRANT UPDATE(pos_display_name) ON TABLE public.stores TO authenticated;
GRANT UPDATE(receipt_footer) ON TABLE public.stores TO authenticated;
GRANT UPDATE(receipt_header) ON TABLE public.stores TO authenticated;
GRANT UPDATE(receipt_logo_url) ON TABLE public.stores TO authenticated;
GRANT UPDATE(region_code) ON TABLE public.stores TO authenticated;
GRANT UPDATE(return_policy) ON TABLE public.stores TO authenticated;
GRANT UPDATE(setup_completed_at) ON TABLE public.stores TO authenticated;
GRANT UPDATE(setup_state) ON TABLE public.stores TO authenticated;
GRANT UPDATE(show_expected_before_count) ON TABLE public.stores TO authenticated;
GRANT UPDATE(social_links) ON TABLE public.stores TO authenticated;
GRANT UPDATE(starting_cash_float) ON TABLE public.stores TO authenticated;
GRANT UPDATE(state) ON TABLE public.stores TO authenticated;
GRANT UPDATE(tax_id) ON TABLE public.stores TO authenticated;
GRANT UPDATE(tax_inclusive) ON TABLE public.stores TO authenticated;
GRANT UPDATE(tax_rate) ON TABLE public.stores TO authenticated;
GRANT UPDATE(thank_you_message) ON TABLE public.stores TO authenticated;
GRANT UPDATE(time_zone) ON TABLE public.stores TO authenticated;
GRANT UPDATE(updated_at) ON TABLE public.stores TO authenticated;
GRANT UPDATE(variance_alert_threshold) ON TABLE public.stores TO authenticated;
GRANT UPDATE(website) ON TABLE public.stores TO authenticated;
GRANT UPDATE(zip) ON TABLE public.stores TO authenticated;

-- Sequence grants
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.receipt_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.receipt_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.receipt_number_seq TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_ticket_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_ticket_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_ticket_number_seq TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_tickets_ticket_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_tickets_ticket_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;

-- SECTION: FUNCTION EXECUTE PRIVILEGES
REVOKE ALL ON FUNCTION public.activate_verified_business_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_business_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_business_trial() TO service_role;
REVOKE ALL ON FUNCTION public.admin_global_search(_q text, _limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_search(_q text, _limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_search(_q text, _limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.can_manage_employee(_actor uuid, _target uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(_actor uuid, _target uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(_actor uuid, _target uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_api_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limit_buckets() TO service_role;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(p_key_hash text, p_scope text, p_limit integer, p_window_seconds integer, p_block_seconds integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(p_key_hash text, p_scope text, p_limit integer, p_window_seconds integer, p_block_seconds integer) TO service_role;
REVOKE ALL ON FUNCTION public.current_store_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO service_role;
REVOKE ALL ON FUNCTION public.delete_email(queue_name text, message_id bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.email_for_employee_id(p_employee_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_employee_id(p_employee_id text) TO service_role;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_authenticated_write_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_authenticated_write_rate_limit() TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pos_sale(p_sale jsonb, p_items jsonb, p_payments jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.generate_employee_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_employee_id() TO service_role;
REVOKE ALL ON FUNCTION public.generate_store_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_store_code() TO service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
REVOKE ALL ON FUNCTION public.has_active_plan(_store_id uuid, _min_tier text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_plan(_store_id uuid, _min_tier text) TO service_role;
REVOKE ALL ON FUNCTION public.has_admin_permission(_user_id uuid, _permission text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(_user_id uuid, _permission text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(_user_id uuid, _permission text) TO service_role;
REVOKE ALL ON FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) TO service_role;
REVOKE ALL ON FUNCTION public.has_permission(_user_id uuid, _permission text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO service_role;
REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO service_role;
REVOKE ALL ON FUNCTION public.is_last_owner(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_last_owner(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_last_owner(_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_platform_staff(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_read_only(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_read_only(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_super_admin(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text, _priority text, _subject text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text, _priority text, _subject text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_update_support_ticket(_ticket_id uuid, _status text, _priority text, _subject text) TO service_role;
REVOKE ALL ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.plan_tier_for_price(_price_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_tier_for_price(_price_id text) TO service_role;
REVOKE ALL ON FUNCTION public.pos_find_pin_candidates(_store_id uuid, _fingerprint text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_find_pin_candidates(_store_id uuid, _fingerprint text) TO service_role;
REVOKE ALL ON FUNCTION public.pos_list_unfingerprinted(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_list_unfingerprinted(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid) TO service_role;
REVOKE ALL ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) TO service_role;
REVOKE ALL ON FUNCTION public.recompute_store_plan(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_store_plan(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone, p_source text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone, p_source text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone, p_source text) TO service_role;
REVOKE ALL ON FUNCTION public.seza_attach_signup_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seza_attach_signup_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seza_attach_signup_identity() TO service_role;
REVOKE ALL ON FUNCTION public.seza_prepare_new_store_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seza_prepare_new_store_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seza_prepare_new_store_trial() TO service_role;
REVOKE ALL ON FUNCTION public.simulate_trial_expiry(_store_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_trial_expiry(_store_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tg_assign_receipt_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_receipt_number() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_assign_receipt_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_receipt_number() TO service_role;
REVOKE ALL ON FUNCTION public.tg_assign_ticket_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_ticket_number() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_assign_ticket_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_assign_ticket_number() TO service_role;
REVOKE ALL ON FUNCTION public.tg_decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_decrement_stock_on_sale() TO service_role;
REVOKE ALL ON FUNCTION public.tg_device_registrations_protect_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_device_registrations_protect_secret() TO service_role;
REVOKE ALL ON FUNCTION public.tg_enforce_role_exclusivity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_enforce_role_exclusivity() TO service_role;
REVOKE ALL ON FUNCTION public.tg_profiles_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_profiles_prevent_privileged_self_update() TO service_role;
REVOKE ALL ON FUNCTION public.tg_protect_super_admin_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_protect_super_admin_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_protect_super_admin_role() TO service_role;
REVOKE ALL ON FUNCTION public.tg_restock_on_refund() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_restock_on_refund() TO service_role;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.tg_stores_prevent_platform_field_writes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_stores_prevent_platform_field_writes() TO service_role;
REVOKE ALL ON FUNCTION public.tg_subscription_recompute() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_subscription_recompute() TO service_role;
REVOKE ALL ON FUNCTION public.tg_time_entries_compute_late() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_time_entries_compute_late() TO service_role;
REVOKE ALL ON FUNCTION public.tg_time_entries_prevent_privileged_self_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_time_entries_prevent_privileged_self_update() TO service_role;
REVOKE ALL ON FUNCTION public.tg_update_sale_refund_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_update_sale_refund_totals() TO service_role;
REVOKE ALL ON FUNCTION public.tg_user_roles_protect_last_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_user_roles_protect_last_owner() TO service_role;
REVOKE ALL ON FUNCTION public.tier_rank(_tier text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_rank(_tier text) TO anon;
GRANT EXECUTE ON FUNCTION public.tier_rank(_tier text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_rank(_tier text) TO service_role;

-- SECTION: RLS POLICIES (public schema)
CREATE POLICY admin_permissions_platform_staff_read ON public.admin_permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_staff(auth.uid()));

CREATE POLICY admin_support_sessions_merchant_read ON public.admin_support_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY admin_support_sessions_merchant_respond ON public.admin_support_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND (status = ANY (ARRAY['pending'::text, 'active'::text]))))
  WITH CHECK (((store_id = current_store_id()) AND (status = ANY (ARRAY['active'::text, 'declined'::text, 'ended'::text]))));

CREATE POLICY admin_support_sessions_super_admin_all ON public.admin_support_sessions AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Cashiers can insert their own age verifications" ON public.age_verifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((cashier_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY "Managers can read age verifications" ON public.age_verifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Employees insert their own audit entries" ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((actor_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY "Employees read their own audit entries" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((actor_id = auth.uid()));

CREATE POLICY "Managers and owners read all audit entries" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]) AND (store_id = current_store_id())));

CREATE POLICY audit_log_super_admin_select ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Cashiers insert safe drops for own open session" ON public.cash_movements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND (user_id = auth.uid()) AND (type = 'safe_drop'::text) AND (EXISTS ( SELECT 1
   FROM register_sessions rs
  WHERE ((rs.id = cash_movements.register_session_id) AND (rs.opened_by = auth.uid()) AND (rs.status = 'open'::text))))));

CREATE POLICY "Owners and admins delete cash movements" ON public.cash_movements AS PERMISSIVE FOR DELETE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])));

CREATE POLICY "Privileged members insert cash movements" ON public.cash_movements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND (user_id = auth.uid()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Store members read cash movements" ON public.cash_movements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY cash_movements_super_admin_select ON public.cash_movements AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY categories_modify ON public.categories AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY categories_select ON public.categories AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY country_profiles_select_authenticated ON public.country_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY customers_delete_mgmt ON public.customers AS PERMISSIVE FOR DELETE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY customers_insert ON public.customers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((store_id = current_store_id()));

CREATE POLICY customers_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY customers_super_admin_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY customers_update ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((store_id = current_store_id()))
  WITH CHECK ((store_id = current_store_id()));

CREATE POLICY device_pairing_codes_creator_delete ON public.device_pairing_codes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((created_by = auth.uid()));

CREATE POLICY device_pairing_codes_manager_insert ON public.device_pairing_codes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY device_pairing_codes_owner_read ON public.device_pairing_codes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((created_by = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY device_registrations_manager_read ON public.device_registrations AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY device_registrations_manager_write ON public.device_registrations AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "service_role manages send log" ON public.email_send_log AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role manages send state" ON public.email_send_state AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role manages unsubscribe tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY legal_acceptances_select_own ON public.legal_acceptances AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]))));

CREATE POLICY "Owners read own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Owners remove own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Owners rename own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY payment_attempts_super_admin_select ON public.payment_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "staff can insert payment attempts" ON public.payment_attempts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((attempted_by IS NULL) OR (attempted_by = auth.uid())) AND (store_id = current_store_id())));

CREATE POLICY "staff can read payment attempts" ON public.payment_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id IS NOT NULL) AND (store_id = current_store_id())));

CREATE POLICY "Managers can manage terminals" ON public.payment_terminals AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Managers can view store terminals" ON public.payment_terminals AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY payment_terminals_super_admin_all ON public.payment_terminals AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY products_modify ON public.products AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY products_select ON public.products AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR (has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (store_id = current_store_id()))));

CREATE POLICY profiles_super_admin_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY profiles_super_admin_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = auth.uid()) AND (status = 'active'::text)))
  WITH CHECK (((id = auth.uid()) AND (status = 'active'::text) AND (store_id = ( SELECT p.store_id
   FROM profiles p
  WHERE (p.id = auth.uid())))));

CREATE POLICY "refund_items insert by staff" ON public.refund_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role, 'cashier'::app_role]) AND (EXISTS ( SELECT 1
   FROM refunds r
  WHERE ((r.id = refund_items.refund_id) AND (r.store_id = current_store_id()))))));

CREATE POLICY "refund_items readable" ON public.refund_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM refunds r
  WHERE ((r.id = refund_items.refund_id) AND (r.store_id = current_store_id())))));

CREATE POLICY "refunds insert by staff" ON public.refunds AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role, 'cashier'::app_role]) AND (store_id = current_store_id()) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = refunds.sale_id) AND (s.store_id = current_store_id()))))));

CREATE POLICY "refunds readable by store users" ON public.refunds AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY refunds_super_admin_select ON public.refunds AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Owner/opener can update register sessions" ON public.register_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND ((opened_by = auth.uid()) OR has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))))
  WITH CHECK (((store_id = current_store_id()) AND ((opened_by = auth.uid()) OR has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))));

CREATE POLICY "Staff can open register sessions" ON public.register_sessions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((opened_by = auth.uid()) AND (store_id IN ( SELECT profiles.store_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

CREATE POLICY "Staff can view store register sessions" ON public.register_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id IN ( SELECT profiles.store_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY register_sessions_super_admin_select ON public.register_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Management can read role permissions" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY "Owners and admins manage role permissions" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])));

CREATE POLICY sale_items_insert ON public.sale_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND (s.cashier_id = auth.uid()) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_items_select ON public.sale_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_payments_insert ON public.sale_payments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_payments.sale_id) AND (s.cashier_id = auth.uid()) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_payments_select ON public.sale_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_payments.sale_id) AND (s.store_id = current_store_id())))));

CREATE POLICY sale_payments_super_admin_select ON public.sale_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY sale_payments_update_mgmt ON public.sale_payments AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sales_insert ON public.sales AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((cashier_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY sales_no_delete ON public.sales AS PERMISSIVE FOR DELETE TO authenticated
  USING (false);

CREATE POLICY sales_select ON public.sales AS PERMISSIVE FOR SELECT TO authenticated
  USING ((store_id = current_store_id()));

CREATE POLICY sales_super_admin_select ON public.sales AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY sales_update_mgmt ON public.sales AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY sms_send_log_insert_store ON public.sms_send_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sms_send_log_select_store ON public.sms_send_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sms_send_log_update_store ON public.sms_send_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role])));

CREATE POLICY sms_settings_delete_store ON public.sms_settings AS PERMISSIVE FOR DELETE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY sms_settings_select_store ON public.sms_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])));

CREATE POLICY sms_settings_update_store ON public.sms_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY sms_settings_upsert_store ON public.sms_settings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY stores_modify ON public.stores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])))
  WITH CHECK (((id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role])));

CREATE POLICY stores_select ON public.stores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = current_store_id()));

CREATE POLICY stores_super_admin_select ON public.stores AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY stores_super_admin_update ON public.stores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Service role manages subscriptions" ON public.subscriptions AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users view own subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY subscriptions_super_admin_select ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY ticket_notes_merchant_insert ON public.support_ticket_notes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((author_id = auth.uid()) AND (internal = false) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.status = 'active'::text) AND (p.store_id = current_store_id())))) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_ticket_notes.ticket_id) AND (t.store_id = current_store_id()) AND (t.status <> 'closed'::text))))));

CREATE POLICY ticket_notes_merchant_view ON public.support_ticket_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((internal = false) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_ticket_notes.ticket_id) AND (t.store_id = current_store_id()))))));

CREATE POLICY ticket_notes_super_admin_all ON public.support_ticket_notes AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY support_tickets_merchant_insert ON public.support_tickets AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((store_id = current_store_id()) AND (requester_id = auth.uid())));

CREATE POLICY support_tickets_merchant_view ON public.support_tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING (((store_id IS NOT NULL) AND (store_id = current_store_id()) AND ((requester_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'manager'::app_role]))));

CREATE POLICY support_tickets_super_admin_all ON public.support_tickets AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "service_role manages suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "self and managers read time entries" ON public.time_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR ((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]))));

CREATE POLICY "self insert time entries" ON public.time_entries AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY "self update time entries" ON public.time_entries AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND (store_id = current_store_id())))
  WITH CHECK (((user_id = auth.uid()) AND (store_id = current_store_id())));

CREATE POLICY time_entries_super_admin_select ON public.time_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY super_admin_select_all_user_roles ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY user_roles_modify ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (role <> 'super_admin'::app_role)))
  WITH CHECK (((store_id = current_store_id()) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (role <> 'super_admin'::app_role)));

CREATE POLICY user_roles_select_own ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (store_id = current_store_id()))));

CREATE POLICY user_roles_super_admin_modify ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- SECTION: STORAGE BUCKETS AND POLICIES
-- bucket 'avatars' (public=f, file_size_limit=null, allowed_mime_types=null)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', 'f', NULL, NULL) ON CONFLICT (id) DO NOTHING;
-- bucket 'product-images' (public=f, file_size_limit=null, allowed_mime_types=null)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('product-images', 'product-images', 'f', NULL, NULL) ON CONFLICT (id) DO NOTHING;

-- storage.objects policies
CREATE POLICY avatars_admin_write ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'avatars'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (EXISTS ( SELECT 1
   FROM (profiles p_owner
     JOIN profiles p_me ON ((p_me.id = auth.uid())))
  WHERE ((p_owner.id = objects.owner) AND (p_owner.store_id IS NOT NULL) AND (p_owner.store_id = p_me.store_id))))))
  WITH CHECK (((bucket_id = 'avatars'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) AND (EXISTS ( SELECT 1
   FROM (profiles p_owner
     JOIN profiles p_me ON ((p_me.id = auth.uid())))
  WHERE ((p_owner.id = objects.owner) AND (p_owner.store_id IS NOT NULL) AND (p_owner.store_id = p_me.store_id))))));

CREATE POLICY avatars_delete_own ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

CREATE POLICY avatars_insert_own ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY avatars_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.store_id = ( SELECT p2.store_id
           FROM profiles p2
          WHERE (p2.id = objects.owner)))))))));

CREATE POLICY avatars_update_own ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "product-images delete same store" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (profiles p_owner
     JOIN profiles p_me ON ((p_me.id = auth.uid())))
  WHERE ((p_owner.id = objects.owner) AND (p_owner.store_id IS NOT NULL) AND (p_owner.store_id = p_me.store_id)))))));

CREATE POLICY "product-images insert same store" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (owner = auth.uid())));

CREATE POLICY "product-images read same store" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'product-images'::text) AND ((owner = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.store_id = ( SELECT p2.store_id
           FROM profiles p2
          WHERE (p2.id = objects.owner)))))))));

CREATE POLICY "product-images update same store" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (current_store_id() IS NOT NULL) AND ((storage.foldername(name))[1] = (current_store_id())::text)))
  WITH CHECK (((bucket_id = 'product-images'::text) AND has_any_role(auth.uid(), ARRAY['owner'::app_role, 'manager'::app_role, 'admin'::app_role]) AND (owner = auth.uid()) AND (current_store_id() IS NOT NULL) AND ((storage.foldername(name))[1] = (current_store_id())::text)));

-- other storage policies
--   (none)

-- SECTION: REALTIME
-- publication supabase_realtime: public.admin_support_sessions, public.payment_terminals, public.role_permissions, public.stores, public.support_ticket_notes, public.support_tickets, public.time_entries
-- publication supabase_realtime_messages_publication: realtime.messages_2026_08_17, realtime.messages_2026_08_18, realtime.messages_2026_08_19, realtime.messages_2026_08_20, realtime.messages_2026_08_21, realtime.messages_2026_08_22, realtime.messages_2026_08_23, realtime.messages_2026_08_24, realtime.messages_2026_08_25, realtime.messages_2026_08_26

-- realtime.messages policies
CREATE POLICY customer_display_read_own_store ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((realtime.topic() = ('customer-display:'::text || (current_store_id())::text)));

CREATE POLICY customer_display_write_own_store ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((realtime.topic() = ('customer-display:'::text || (current_store_id())::text)));

-- SECTION: QUEUES AND CRON
-- pgmq queue: auth_emails (is_partitioned=false, is_unlogged=false)
-- pgmq queue: auth_emails_dlq (is_partitioned=false, is_unlogged=false)
-- pgmq queue: transactional_emails (is_partitioned=false, is_unlogged=false)
-- pgmq queue: transactional_emails_dlq (is_partitioned=false, is_unlogged=false)
-- cron jobs currently scheduled:
--   (none)


-- Realtime publication membership (recreate on the new project).
-- NOTE: device_registrations is intentionally NOT published (it holds device secret hashes).
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_support_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_terminals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- pgmq queues used by the email pipeline.
SELECT pgmq.create('auth_emails');
SELECT pgmq.create('auth_emails_dlq');
SELECT pgmq.create('transactional_emails');
SELECT pgmq.create('transactional_emails_dlq');

-- TODO (manual, cannot be represented safely in SQL):
--   * public.email_queue_dispatch() and public.email_queue_wake() POST to a
--     hardcoded Lovable app URL. After migrating, replace that URL with your own
--     deployment origin (e.g. https://app.sezapos.com/lovable/email/queue/process).
--   * Those functions read a Vault secret named 'email_queue_service_role_key'.
--     Create it manually: select vault.create_secret('<service role key>', 'email_queue_service_role_key');
--     Never commit the key.
--   * No cron jobs are scheduled at rest; 'process-email-queue' is created and
--     removed dynamically by email_queue_wake()/email_queue_dispatch().
--   * Auth providers (email, Google), SMTP, redirect URLs, JWT/signing keys, and
--     all project secrets are configured outside SQL.
--   * auth.users, storage objects, and all production row data are intentionally
--     excluded from this file (structure only). Seed reference data such as
--     public.country_profiles, public.admin_permissions and public.platform_settings
--     separately after applying this migration.
--   * Triggers on auth.users (handle_new_user, seza_attach_signup_identity,
--     activate_verified_business_trial) live in the auth schema and must be
--     recreated with elevated privileges on the new project; see the block below.


-- SECTION: AUTH-SCHEMA TRIGGERS (run as a superuser / via the SQL editor)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seza_attach_signup_identity();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_trial ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_trial
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.activate_verified_business_trial();
