-- Current admin-only hardware diagnostic state for each paired POS device.
-- No merchant/anon/authenticated client receives direct table access.
create table if not exists public.admin_device_diagnostics (
  device_id uuid primary key references public.device_registrations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  subsystem text not null default 'Stripe Terminal',
  stage text not null check (stage in (
    'MERCHANT_RESET',
    'STRIPE_INITIALIZE',
    'ANDROID_PERMISSION',
    'CONNECTION_TOKEN',
    'DISCOVER_USB',
    'DISCOVER_USB_EMPTY',
    'CONNECT_READER_NATIVE',
    'READER_API_SAVE',
    'CONNECTED'
  )),
  status text not null check (status in ('progress', 'error', 'ok')),
  transport text null check (transport in ('USB', 'Bluetooth')),
  reader_discovered boolean,
  reader_serial text,
  stripe_plugin_linked boolean,
  merchant_ready boolean,
  terminal_location_ready boolean,
  connection_token_requested boolean not null default false,
  connection_token_delivered boolean not null default false,
  native_error_code text,
  native_error text,
  app_version text,
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_device_diagnostics_store_updated_idx
  on public.admin_device_diagnostics (store_id, updated_at desc);

alter table public.admin_device_diagnostics enable row level security;

-- This table is intentionally server-only. SEZA's server-side service-role
-- client writes heartbeat diagnostics and platform-staff server functions read
-- them after their own authorization checks.
revoke all on table public.admin_device_diagnostics from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_device_diagnostics to service_role;

comment on table public.admin_device_diagnostics is
  'SEZA platform-staff-only current device diagnostics. Sensitive credentials/tokens must never be stored here.';
