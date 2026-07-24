# Database Instructions

The source patch is not enough by itself. The four new migrations must be applied to the same Supabase/Lovable Cloud project used by the website and Android APK.

## Before applying

1. Confirm the production project reference and make a database backup or point-in-time recovery checkpoint.
2. Confirm that the repository already contains all earlier migrations through `20260722190000_seza_major_release_readiness.sql`.
3. Do not apply only the newest migration while older pending migrations remain. Apply every pending migration in timestamp order.

## Preferred method: Supabase CLI

From the project root:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push
```

Review the target project name carefully before approving the push.

## Lovable Cloud / SQL Editor method

When CLI linking is unavailable, open the production SQL editor and execute these files in this exact order:

1. `supabase/migrations/20260723212000_tenant_permission_scope.sql`
2. `supabase/migrations/20260723213000_atomic_pos_sale_finalize.sql`
3. `supabase/migrations/20260723214500_support_and_platform_consistency.sql`
4. `supabase/migrations/20260723220000_legal_acceptance_records.sql`

Do not modify identifiers or remove transaction logic.

## Verification queries

Run after migration:

```sql
select proname
from pg_proc
where proname in ('has_permission', 'finalize_pos_sale', 'record_legal_acceptance')
order by proname;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'support_tickets'
  and column_name in (
    'claimed_at', 'chat_status', 'chat_ended_at', 'chat_ended_by',
    'last_message_at', 'first_response_at', 'last_admin_read_at',
    'last_merchant_read_at', 'resolution_summary', 'resolution_code'
  )
order by column_name;

select id, maintenance_mode, live_chat_enabled, updated_at
from public.platform_settings
where id = 'global';

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('support_tickets', 'support_ticket_notes')
order by tablename;

select to_regclass('public.legal_acceptances') as legal_acceptances_table;
```

Expected results:

- All three functions exist.
- All listed support columns exist.
- The `global` platform-settings row exists.
- Both support tables are in `supabase_realtime`.
- `legal_acceptances_table` returns `legal_acceptances`.

## Important deployment order

Deploy database migrations **before** releasing website 1.3.0 or Android build 6. Otherwise checkout may receive a missing-RPC error and correctly move local sales to **Needs Attention** instead of risking partial records.

## Rollback

Source files can be restored from the backup made by `APPLY-PATCH.ps1`. Database migrations intentionally add security rules, tables, columns, and functions and should not be blindly reversed. Restore the database checkpoint or create a reviewed forward migration if rollback is required.
