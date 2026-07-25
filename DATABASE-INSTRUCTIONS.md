# Database Instructions

Source files alone do not activate database functions, policies, or shared rate limits. Apply every pending migration to the same Supabase/Lovable Cloud project used by the website and Android APK before releasing version 1.3.2 / Android build 8.

## Before applying

1. Confirm the production project reference.
2. Create a backup or point-in-time recovery checkpoint.
3. Run migrations in timestamp order; never apply only one later file while earlier files remain pending.
4. Review the target project name before approving any production push.

## Preferred method: Supabase CLI

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push
```

## Lovable Cloud / SQL Editor method

When CLI linking is unavailable, execute every unapplied file in timestamp order. The release chain from the production hardening work through this cleanup is:

1. `20260723212000_tenant_permission_scope.sql`
2. `20260723213000_atomic_pos_sale_finalize.sql`
3. `20260723214500_support_and_platform_consistency.sql`
4. `20260723220000_legal_acceptance_records.sql`
5. `20260724051233_9df00199-761b-4c5a-a12a-7763336d0568.sql`
6. `20260724051321_6aaa5813-fbb8-4341-99b6-d0413937a03b.sql`
7. `20260724051441_eed3acd4-927f-4027-97f4-7bebfc94bc7d.sql`
8. `20260724051525_9dd5dc3c-141a-4442-81b7-31a95b5955fc.sql`
9. `20260724051605_43890894-b4cf-485e-8340-8f9330f718a1.sql`
10. `20260724053904_16d30778-7d80-4df2-9dea-7ee8d2a37a08.sql`
11. `20260724074623_9faffbeb-83cd-40a7-a425-2a17bf72e671.sql`
12. `20260724123000_public_website_live_chat.sql`
13. `20260725043000_public_api_rate_limits.sql`

Use `supabase migration list` or the Lovable migration history to skip files already applied. Do not re-run an unknown migration blindly.

## Release verification queries

```sql
select proname
from pg_proc
where proname in (
  'has_permission',
  'finalize_pos_sale',
  'record_legal_acceptance',
  'consume_public_rate_limit'
)
order by proname;

select to_regclass('public.legal_acceptances') as legal_acceptances_table,
       to_regclass('public.public_api_rate_limits') as public_api_rate_limits_table;

select id, maintenance_mode, live_chat_enabled, updated_at
from public.platform_settings
where id = 'global';

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('support_tickets', 'support_ticket_notes')
order by tablename;
```

Expected:

- The four named functions exist.
- Both named tables resolve.
- The global platform-settings row exists.
- Both support tables are in the realtime publication.

## Deployment order

1. Back up the database.
2. Apply all pending migrations.
3. Deploy the website/admin/POS source from the same commit.
4. Build Android 1.3.2/build 8 from that commit.
5. Complete `RELEASE-TEST-CHECKLIST.md` on a pilot register.

Without the rate-limit migration, endpoints use only a process-local fallback and protection is not shared across server instances. Without the atomic-sale migrations, checkout must not be released.

## Rollback

Do not delete production tables/functions casually. Restore the database checkpoint or create a reviewed forward migration. Source rollback should use Git or a known-good release tag.
