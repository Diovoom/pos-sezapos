
-- =========================================================================
-- Phase 1: Admin Foundation
-- =========================================================================

-- 1. admin_permissions catalog (text role column, decoupled from app_role enum
-- so we can add new platform-staff labels without ALTER TYPE dance).
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read admin permissions"
  ON public.admin_permissions FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: only service_role writes.

-- 2. has_admin_permission RPC
CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.has_admin_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(uuid, text) TO authenticated, service_role;

-- 3. admin_login_attempts (rate limiting for /admin/auth)
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  success boolean NOT NULL,
  ip text,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time
  ON public.admin_login_attempts (lower(email), attempted_at DESC);

GRANT SELECT, INSERT ON public.admin_login_attempts TO authenticated;
GRANT ALL ON public.admin_login_attempts TO service_role;

ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only super_admin may read the raw log. Rate-limit checks run via service_role.
CREATE POLICY "Super admins can read login attempts"
  ON public.admin_login_attempts FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies: writes go through service_role.

-- 4. Broaden is_platform_staff to the full 7-role set.
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 5. Seed initial permission catalog.
-- super_admin bypass is in has_admin_permission, so no rows needed for it.
INSERT INTO public.admin_permissions (role, permission) VALUES
  -- operations_admin: broad read + most manage, no dangerous billing/refund by default
  ('operations_admin', 'businesses.view'),
  ('operations_admin', 'businesses.manage'),
  ('operations_admin', 'stores.view'),
  ('operations_admin', 'stores.manage'),
  ('operations_admin', 'employees.view'),
  ('operations_admin', 'employees.manage'),
  ('operations_admin', 'devices.view'),
  ('operations_admin', 'devices.manage'),
  ('operations_admin', 'support.view'),
  ('operations_admin', 'support.manage'),
  ('operations_admin', 'support.assign'),
  ('operations_admin', 'support.internal_notes'),
  ('operations_admin', 'support.request_view'),
  ('operations_admin', 'support.end_view'),
  ('operations_admin', 'diagnostics.view'),
  ('operations_admin', 'sync.manage'),
  ('operations_admin', 'hardware.manage'),
  ('operations_admin', 'incidents.view'),
  ('operations_admin', 'incidents.manage'),
  ('operations_admin', 'audit.view'),
  ('operations_admin', 'admin_users.view'),
  ('operations_admin', 'platform_settings.view'),
  ('operations_admin', 'trials.manage'),
  ('operations_admin', 'billing.view'),
  -- support_admin (legacy) / merchant_support: standard support toolkit
  ('support_admin', 'businesses.view'),
  ('support_admin', 'stores.view'),
  ('support_admin', 'employees.view'),
  ('support_admin', 'devices.view'),
  ('support_admin', 'support.view'),
  ('support_admin', 'support.manage'),
  ('support_admin', 'support.assign'),
  ('support_admin', 'support.internal_notes'),
  ('support_admin', 'support.request_view'),
  ('support_admin', 'support.end_view'),
  ('support_admin', 'diagnostics.view'),
  ('support_admin', 'incidents.view'),
  ('support_admin', 'audit.view'),
  ('merchant_support', 'businesses.view'),
  ('merchant_support', 'stores.view'),
  ('merchant_support', 'employees.view'),
  ('merchant_support', 'devices.view'),
  ('merchant_support', 'support.view'),
  ('merchant_support', 'support.manage'),
  ('merchant_support', 'support.assign'),
  ('merchant_support', 'support.internal_notes'),
  ('merchant_support', 'support.request_view'),
  ('merchant_support', 'support.end_view'),
  ('merchant_support', 'diagnostics.view'),
  ('merchant_support', 'incidents.view'),
  ('merchant_support', 'audit.view'),
  -- technical_support: heavier diagnostics/sync/device toolkit
  ('technical_support', 'businesses.view'),
  ('technical_support', 'stores.view'),
  ('technical_support', 'employees.view'),
  ('technical_support', 'devices.view'),
  ('technical_support', 'devices.manage'),
  ('technical_support', 'support.view'),
  ('technical_support', 'support.manage'),
  ('technical_support', 'support.assign'),
  ('technical_support', 'support.internal_notes'),
  ('technical_support', 'support.request_view'),
  ('technical_support', 'support.end_view'),
  ('technical_support', 'diagnostics.view'),
  ('technical_support', 'sync.manage'),
  ('technical_support', 'hardware.manage'),
  ('technical_support', 'incidents.view'),
  ('technical_support', 'incidents.manage'),
  ('technical_support', 'audit.view'),
  -- billing_admin / billing_support: subscriptions/payments only
  ('billing_admin', 'businesses.view'),
  ('billing_admin', 'billing.view'),
  ('billing_admin', 'billing.manage'),
  ('billing_admin', 'subscriptions.manage'),
  ('billing_admin', 'trials.manage'),
  ('billing_admin', 'support.view'),
  ('billing_admin', 'support.manage'),
  ('billing_admin', 'support.assign'),
  ('billing_admin', 'support.internal_notes'),
  ('billing_admin', 'audit.view'),
  ('billing_support', 'businesses.view'),
  ('billing_support', 'billing.view'),
  ('billing_support', 'billing.manage'),
  ('billing_support', 'subscriptions.manage'),
  ('billing_support', 'trials.manage'),
  ('billing_support', 'support.view'),
  ('billing_support', 'support.manage'),
  ('billing_support', 'support.assign'),
  ('billing_support', 'support.internal_notes'),
  ('billing_support', 'audit.view'),
  -- compliance_support: audit-focused, safe reads only
  ('compliance_support', 'businesses.view'),
  ('compliance_support', 'stores.view'),
  ('compliance_support', 'employees.view'),
  ('compliance_support', 'devices.view'),
  ('compliance_support', 'support.view'),
  ('compliance_support', 'support.internal_notes'),
  ('compliance_support', 'diagnostics.view'),
  ('compliance_support', 'incidents.view'),
  ('compliance_support', 'audit.view'),
  ('compliance_support', 'audit.export'),
  -- analyst / read_only_auditor: pure reads
  ('analyst', 'businesses.view'),
  ('analyst', 'stores.view'),
  ('analyst', 'employees.view'),
  ('analyst', 'devices.view'),
  ('analyst', 'support.view'),
  ('analyst', 'diagnostics.view'),
  ('analyst', 'incidents.view'),
  ('analyst', 'audit.view'),
  ('analyst', 'billing.view'),
  ('read_only_auditor', 'businesses.view'),
  ('read_only_auditor', 'stores.view'),
  ('read_only_auditor', 'employees.view'),
  ('read_only_auditor', 'devices.view'),
  ('read_only_auditor', 'support.view'),
  ('read_only_auditor', 'diagnostics.view'),
  ('read_only_auditor', 'incidents.view'),
  ('read_only_auditor', 'audit.view'),
  ('read_only_auditor', 'audit.export')
ON CONFLICT (role, permission) DO NOTHING;
