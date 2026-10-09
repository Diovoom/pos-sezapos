// Offline regression check for the new-store signup trigger migration.
// Does not create accounts or write to a live database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20261009093000_fix_signup_identity_platform_write.sql'),
  'utf8',
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.seza_attach_signup_identity\(\)/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /IF v_store IS NOT NULL[\s\S]*EXISTS \([\s\S]*role = 'owner'::public\.app_role/);
assert.match(migration, /v_previous_platform_write := current_setting\('seza\.internal_platform_write', true\)/);
assert.match(migration, /set_config\('seza\.internal_platform_write', 'on', true\)/);
assert.match(migration, /set_config\('seza\.internal_platform_write', coalesce\(v_previous_platform_write, ''\), true\)/);
assert.match(migration, /EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE;/);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.tg_stores_prevent_platform_field_writes/);
assert.doesNotMatch(migration, /DROP TRIGGER|DISABLE TRIGGER|ALTER TABLE public\.stores DISABLE/i);
const on = migration.indexOf("set_config('seza.internal_platform_write', 'on', true)");
const write = migration.indexOf('UPDATE public.stores');
const restore = migration.indexOf("set_config('seza.internal_platform_write', coalesce(v_previous_platform_write, ''), true)", write);
assert.ok(on >= 0 && write > on && restore > write);
console.log('PASS signup trigger has scoped platform-write authorization, owner guard, and restoration');
console.log('PASS existing stores write-protection trigger is unchanged');
