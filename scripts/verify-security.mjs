import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const sourceFiles = [...walk(join(root, "src")), ...walk(join(root, "capacitor-shell"))]
  .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));

for (const file of sourceFiles) {
  const rel = relative(root, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  if (/sb_secret_[A-Za-z0-9_-]+/.test(text)) {
    // Guard code may mention the prefix, but no literal secret can contain a
    // value after it.
    const matches = text.match(/sb_secret_[A-Za-z0-9_-]+/g) ?? [];
    if (matches.some((value) => value !== "sb_secret_")) {
      errors.push(`${rel}: possible secret Supabase key in client-reachable code`);
    }
  }
}

const publicRouteRoots = [
  join(root, "src/routes/api/public"),
  join(root, "src/routes/lovable/email"),
  join(root, "src/routes/lovable/sms"),
  join(root, "src/routes/email"),
];
for (const routeRoot of publicRouteRoots) {
  for (const file of walk(routeRoot).filter((entry) => /\.(ts|tsx)$/.test(entry))) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file).replaceAll("\\", "/");
    if (text.includes("server:") && !text.includes("guardApiRequest")) {
      errors.push(`${rel}: public server route is missing guardApiRequest`);
    }
  }
}

for (const mcpRoute of [
  "src/routes/mcp.ts",
  "src/routes/[.mcp]/list-tools.ts",
  "src/routes/[.mcp]/invoke-tool/$tool.ts",
]) {
  const file = join(root, mcpRoute);
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  if (!text.includes("guardApiRequest")) {
    errors.push(`${mcpRoute}: MCP route is missing guardApiRequest`);
  }
}

for (const authRoute of [
  ["src/routes/auth.tsx", "secureOwnerPasswordSignIn"],
  ["src/routes/admin.auth.tsx", "secureAdminPasswordSignIn"],
  ["src/routes/signup.tsx", "secureMerchantSignUp"],
]) {
  const [route, expected] = authRoute;
  const file = join(root, route);
  if (!existsSync(file)) {
    errors.push(`missing auth route: ${route}`);
    continue;
  }
  if (!readFileSync(file, "utf8").includes(expected)) {
    errors.push(`${route}: missing secured auth function ${expected}`);
  }
}

for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (/\.(bak|backup|orig)$/.test(file) || rel === ".eslintcache") {
    errors.push(`${rel}: backup/cache file should be removed`);
  }
}

const migrationDir = join(root, "supabase/migrations");
const migrationText = walk(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const tableMatches = [...migrationText.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-zA-Z0-9_]+)/gi)]
  .map((match) => match[1]);
for (const table of new Set(tableMatches)) {
  const rls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
  if (!rls.test(migrationText)) warnings.push(`public.${table}: no explicit ENABLE ROW LEVEL SECURITY found`);
}

for (const required of [
  "20260725010000_api_rate_limits_and_security.sql",
  "20260725011000_deprecate_raw_admin_login_attempts.sql",
  "20260725012000_authenticated_write_guards.sql",
]) {
  if (!existsSync(join(migrationDir, required))) errors.push(`missing migration: ${required}`);
}

if (warnings.length) {
  console.warn("Security verification warnings:");
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
if (errors.length) {
  console.error("Security verification failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Security verification passed (${sourceFiles.length} source files checked).`);
