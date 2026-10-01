// Schema-only fixture: no production records or credentials. All writes stay in an ephemeral PGlite database.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
export async function createDatabase() {
  const db = new PGlite();
  const c = JSON.parse(fs.readFileSync(new URL("./merchant-schema.json", import.meta.url), "utf8"));
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}', email_confirmed_at timestamptz, invited_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT decode(md5($1),'hex') $$;
 SET check_function_bodies=off;`);
  for (const t of c.types)
    await db.exec(
      `CREATE TYPE public."${t.name}" AS ENUM (${t.values.map((v) => "'" + v + "'").join(",")});`,
    );
  for (const s of c.sequences) await db.exec(`CREATE SEQUENCE public."${s}";`);
  for (const t of c.tables) await db.exec(t.ddl);
  for (const k of [
    ...c.constraints.filter((k) => !k.includes("FOREIGN KEY")),
    ...c.constraints.filter((k) => k.includes("FOREIGN KEY")),
  ])
    await db.exec(k);
  for (const idx of c.indexes.filter((x) => !x.includes("gin_trgm_ops")))
    await db.exec(
      idx
        .replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS")
        .replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"),
    );
  const skip = ["rls_auto_enable", "read_email_batch", "seza_migration_import", "seza_bulk_import"];
  for (const f of c.functions.filter((f) => !skip.includes(f.name))) await db.exec(f.ddl);
  for (const t of c.triggers) await db.exec(t);
  await db.exec(`GRANT USAGE ON SCHEMA public,auth,extensions TO authenticated,anon,service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,anon,service_role;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,anon,service_role;`);
  for (const t of c.tables.filter((t) => t.rls))
    await db.exec(`ALTER TABLE public."${t.name}" ENABLE ROW LEVEL SECURITY;`);
  for (const p of c.policies)
    await db.exec(
      `CREATE POLICY "${p.name}" ON public."${p.table}" AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map((r) => '"' + r + '"').join(",")} ${p.qual ? "USING (" + p.qual + ")" : ""} ${p.check ? "WITH CHECK (" + p.check + ")" : ""};`,
    );
  await db.exec(
    "REVOKE ALL ON FUNCTION public.is_platform_staff(uuid) FROM PUBLIC,anon,authenticated;",
  );
  return db;
}
