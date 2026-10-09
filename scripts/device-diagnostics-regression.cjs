const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const terminal = read("src/lib/hardware/terminal-stripe.ts");
const diagnostics = read("src/lib/hardware/reader-diagnostics.ts");
const heartbeat = read("capacitor-shell/lib/deviceHeartbeat.ts");
const api = read("src/routes/api/public/pos/device-heartbeat.ts");
const adminFunctions = read("src/lib/admin/company-admin.functions.ts");
const adminBusiness = read("src/routes/_adminApp/admin.businesses.$storeId.tsx");
const migration = read("supabase/migrations/20261006164528_admin_device_diagnostics.sql");

const cashierMessage = "Could not connect to the card reader. Please try again.";
assert(diagnostics.includes(cashierMessage), "cashier-safe reader error is missing");
assert(!heartbeat.includes('last_error: localStorage.getItem("pos.terminal.lastError")'), "terminal error still leaks into merchant status_snapshot");
assert(heartbeat.includes("reader_diagnostic:"), "heartbeat does not send the separate diagnostic payload");
assert(api.includes('operationalSnapshot'), "server does not strip terminal.last_error from merchant snapshots");
assert(api.includes('admin_device_diagnostics'), "heartbeat API does not persist admin diagnostics");
assert(adminFunctions.includes('admin_device_diagnostics'), "admin business workspace does not retrieve diagnostics");
assert(adminBusiness.includes("connection_token_requested") && adminBusiness.includes("connection_token_delivered"), "Admin POS Devices does not display token-stage diagnostics");
assert(migration.includes("revoke all on public.admin_device_diagnostics from public, anon, authenticated"), "diagnostic table is not locked away from merchant/client roles");
assert(migration.includes("grant all on public.admin_device_diagnostics to service_role"), "server service-role grant is missing");

for (const stage of [
  "MERCHANT_RESET",
  "STRIPE_INITIALIZE",
  "ANDROID_PERMISSION",
  "CONNECTION_TOKEN",
  "DISCOVER_USB",
  "DISCOVER_USB_EMPTY",
  "CONNECT_READER_NATIVE",
  "READER_API_SAVE",
  "CONNECTED",
]) {
  assert(diagnostics.includes(`"${stage}"`), `diagnostic stage missing: ${stage}`);
}

const ts = require("typescript"), strict = require("node:assert/strict");
const mod = { exports: {} };
new Function("module", "exports", ts.transpileModule(diagnostics, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const dangerous = {
  device_secret: "SENTINEL_DEVICE", actor_token: "SENTINEL_ACTOR",
  client_secret: "SENTINEL_CLIENT", employee_pin: "SENTINEL_PIN",
  authorization: "SENTINEL_AUTH", token: "SENTINEL_TOKEN",
};
const clean = mod.exports.sanitizeReaderDiagnostic({
  stage: "CONNECTED", status: "ok", ...dangerous,
  native_error: "SENTINEL_ERROR", reader_serial: "SENTINEL_SERIAL",
  timeline: [{ stage: "CONNECTED", status: "ok", timestamp: "2026-10-08T00:00:00Z", ...dangerous }],
});
strict.ok(!JSON.stringify(clean).includes("SENTINEL"));
strict.equal(clean.reader_serial, null);
strict.ok(!JSON.stringify(mod.exports.operationalSnapshot({ terminal: dangerous })).includes("SENTINEL"));
console.log("device diagnostics regression checks passed");
