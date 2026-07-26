import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const warnings = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`Missing required file: ${rel}`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

function requireText(rel, needle, label = needle) {
  const body = read(rel);
  if (!body.includes(needle)) failures.push(`${rel}: missing ${label}`);
}

function forbidText(rel, needle, label = needle) {
  const body = read(rel);
  if (body.includes(needle)) failures.push(`${rel}: contains forbidden ${label}`);
}

const pkg = JSON.parse(read("package.json") || "{}");
const publicVersion = JSON.parse(read("public/version.json") || "{}");
const gradle = read("android/app/build.gradle");
const gradleVersion = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1];
const gradleBuild = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);

if (pkg.version !== publicVersion.version || pkg.version !== gradleVersion) {
  failures.push(
    `Version mismatch: package=${pkg.version}, public=${publicVersion.version}, Android=${gradleVersion}`,
  );
}
if (Number(publicVersion.build) !== gradleBuild) {
  failures.push(`Build mismatch: public=${publicVersion.build}, Android=${gradleBuild}`);
}

function trackedFiles(rel) {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--", rel], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Local .env, node_modules, and build outputs may legitimately exist while a
// developer verifies the project. They are release failures only when Git is
// actually tracking them.
for (const sensitive of [
  ".env",
  ".env.development",
  ".env.production",
  ".env.local",
  "node_modules",
  "dist",
  "android-webdir",
  ".eslintcache",
  "*.bak",
  "SEZA-POS-v1.3.0-PRODUCTION-PATCH",
]) {
  const tracked = trackedFiles(sensitive);
  if (tracked.length)
    failures.push(`Git must not track ${sensitive}: ${tracked.slice(0, 3).join(", ")}`);
}

// This ZIP contained a second full source tree. Unlike ordinary generated
// output, its presence is always ambiguous and can make developers build a
// different copy than the one they edited.
if (fs.existsSync(path.join(root, "pos-sezapos-main"))) {
  failures.push("Remove the nested duplicate project directory: pos-sezapos-main");
}

requireText(
  "src/routes/_pos/pos.tsx",
  'networkMode: "always"',
  "offline-capable checkout mutation",
);
requireText("src/routes/_pos/pos.tsx", '"finalize_pos_sale"', "atomic online sale RPC");
requireText("src/lib/offline/sync.ts", '"finalize_pos_sale"', "atomic offline sale RPC");
requireText("src/lib/offline/sync.ts", "blockedSessionIds", "register dependency ordering");
requireText(
  "src/lib/offline/sync.ts",
  "receipt deferred until sale syncs",
  "receipt dependency ordering",
);
requireText(
  "src/lib/offline/db.ts",
  'db.transaction("meta", "readwrite")',
  "transaction-safe local receipt sequence",
);
requireText(
  "src/lib/offline/db.ts",
  "store_switch_conflict",
  "store-switch financial safety block",
);
requireText("src/lib/audit-log.ts", "store_id", "tenant-scoped audit rows");
requireText(
  "android/app/src/main/AndroidManifest.xml",
  'android:allowBackup="false"',
  "Android backup disabled",
);
requireText(
  "android/app/src/main/java/com/sezapos/app/MainActivity.java",
  "SezaSecureStoragePlugin.class",
  "secure-storage plugin registration",
);
requireText(
  "capacitor-shell/lib/pairing.ts",
  "SecureStorage.savePairing",
  "Keystore-backed pairing persistence",
);
requireText(
  "supabase/migrations/20260723212000_tenant_permission_scope.sql",
  "ur.store_id = public.current_store_id()",
  "tenant-scoped permission migration",
);
requireText(
  "supabase/migrations/20260723213000_atomic_pos_sale_finalize.sql",
  "CREATE OR REPLACE FUNCTION public.finalize_pos_sale",
  "atomic sale migration",
);
requireText(
  "supabase/migrations/20260723213000_atomic_pos_sale_finalize.sql",
  "FOR UPDATE OF p",
  "inventory row locking",
);
requireText(
  "supabase/migrations/20260723214500_support_and_platform_consistency.sql",
  "supabase_realtime",
  "support realtime migration",
);
forbidText(
  "src/components/i18n/GlobalLanguageRuntime.tsx",
  "replaceTextNodeBySubstring",
  "substring translator",
);
requireText("src/routes/_dashboard/setup.tsx", 'to="/legal/$slug"', "working legal policy links");
forbidText("src/routes/_dashboard/setup.tsx", 'href="#"', "placeholder legal links");
requireText(
  "src/routes/_dashboard/setup.tsx",
  '"record_legal_acceptance"',
  "versioned legal acceptance RPC",
);
requireText(
  "src/routes/signup.tsx",
  "termsVersion: LEGAL_CONFIG.termsVersion",
  "signup policy version input",
);
requireText(
  "src/lib/auth/auth.functions.ts",
  "terms_version: data.termsVersion",
  "server-side signup policy metadata",
);
requireText(
  "supabase/migrations/20260723220000_legal_acceptance_records.sql",
  "CREATE TABLE IF NOT EXISTS public.legal_acceptances",
  "legal acceptance migration",
);

// The generated TanStack route tree imports all route modules during SSR.
// Barcode libraries must remain behind a browser-only dynamic boundary or a
// CommonJS/ESM interop failure can take down marketing, dashboard, and admin.
forbidText(
  "src/components/pos/BarcodeScanner.tsx",
  'from "@zxing/browser"',
  "static ZXing browser import",
);
forbidText(
  "src/components/pos/BarcodeScanner.tsx",
  'from "@zxing/library"',
  "static ZXing library import",
);
forbidText(
  "src/components/pos/AgeVerificationDialog.tsx",
  "@zxing/library",
  "ZXing runtime import outside scanner boundary",
);
requireText(
  "src/components/pos/BarcodeScanner.tsx",
  'import("@zxing/browser")',
  "browser-only ZXing scanner import",
);
requireText(
  "src/components/pos/BarcodeScanner.tsx",
  'import("@zxing/library")',
  "browser-only ZXing runtime import",
);

const lock = JSON.parse(read("package-lock.json") || "{}");
const zxing = lock.packages?.["node_modules/@zxing/library"];
if (zxing?.engines?.node && String(zxing.engines.node).includes(">= 24")) {
  const nvm = read(".nvmrc").trim();
  if (!nvm.startsWith("24"))
    failures.push(".nvmrc must use Node 24 because the locked ZXing package requires Node >=24");
}

if (!fs.existsSync(path.join(root, "supabase/migrations")))
  failures.push("Missing Supabase migrations directory");
if (!fs.existsSync(path.join(root, ".github/workflows/quality.yml")))
  warnings.push("GitHub quality workflow is missing");

if (warnings.length) {
  console.warn("SEZA production verification warnings:");
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
if (failures.length) {
  console.error("SEZA production verification failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `SEZA production verification passed for v${pkg.version} build ${publicVersion.build}.`,
);
