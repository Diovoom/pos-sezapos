-- Admin diagnostics are deliberately separate from merchant-readable heartbeats.
-- Supersede the earlier pending diagnostics shape before this schema is created.
-- This table stores transient current-state hardware diagnostics only; POS heartbeats
-- repopulate it automatically, and no financial/merchant records live here.
drop table if exists public.admin_device_diagnostics;
create table public.admin_device_diagnostics (
  device_id uuid primary key references public.device_registrations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  diagnostic jsonb not null,
  app_version text,
  received_at timestamptz not null default now()
);
create index admin_device_diagnostics_store_idx on public.admin_device_diagnostics(store_id);
alter table public.admin_device_diagnostics enable row level security;
revoke all on public.admin_device_diagnostics from public, anon, authenticated;
grant all on public.admin_device_diagnostics to service_role;
-- No browser/merchant SELECT policy. Reads go through ensurePlatformStaff()
-- in adminBusinessWorkspace; writes use authenticated device heartbeat only.

-- Remove the legacy technical error from existing merchant-readable snapshots.
-- New heartbeats rebuild this operational object with an allowlist.
update public.device_registrations
set status_snapshot = status_snapshot #- '{terminal,last_error}'
where status_snapshot #> '{terminal,last_error}' is not null;
