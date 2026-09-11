-- SEZA global store configuration consistency guard.
-- Canonical tax_rate is a decimal fraction: 0.065 = 6.5%.
-- Store names may never be blank because the POS/header/receipt all depend on it.

update public.stores
set name = nullif(btrim(setup_state->'store'->>'name'), '')
where nullif(btrim(coalesce(name, '')), '') is null
  and nullif(btrim(setup_state->'store'->>'name'), '') is not null;

-- Legacy setup wizard versions stored a human percentage (8.25) in the
-- decimal tax_rate column. Normalize those values for every merchant.
update public.stores
set tax_rate = tax_rate / 100
where tax_rate > 1 and tax_rate <= 100;

-- If an old/incomplete record still has no usable name, retain a stable,
-- store-specific label instead of an empty header.
update public.stores
set name = 'Store ' || coalesce(store_code, left(id::text, 8))
where nullif(btrim(coalesce(name, '')), '') is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stores_name_not_blank'
  ) then
    alter table public.stores
      add constraint stores_name_not_blank
      check (length(btrim(name)) between 1 and 120) not valid;
  end if;
end $$;

alter table public.stores validate constraint stores_name_not_blank;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stores_tax_rate_decimal_range'
  ) then
    alter table public.stores
      add constraint stores_tax_rate_decimal_range
      check (tax_rate >= 0 and tax_rate <= 1) not valid;
  end if;
end $$;

alter table public.stores validate constraint stores_tax_rate_decimal_range;
