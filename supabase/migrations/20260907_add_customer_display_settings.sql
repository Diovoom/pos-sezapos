alter table public.stores
  add column if not exists customer_display_settings jsonb not null
  default '{"idleMode":"message","welcomeMessage":"Welcome","imageUrl":null,"textScale":1}'::jsonb;

update public.stores
set customer_display_settings = coalesce(
  customer_display_settings,
  '{"idleMode":"message","welcomeMessage":"Welcome","imageUrl":null,"textScale":1}'::jsonb
);
