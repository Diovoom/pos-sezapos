-- SEZA subscription plan mapping must fail closed. Unknown Stripe prices must
-- never silently receive Starter entitlements.
create or replace function public.plan_tier_for_price(_price_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select case _price_id
    when 'business_monthly' then 'business'
    when 'pro_monthly'      then 'pro'
    when 'starter_monthly'  then 'starter'
    else 'expired'
  end;
$$;

comment on function public.plan_tier_for_price(text) is
  'Maps approved SEZA Stripe lookup keys to plan tiers; unknown prices fail closed as expired.';
