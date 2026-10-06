const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const terminal = read("src/lib/hardware/terminal-stripe.ts");
const diagnostics = read("src/lib/hardware/terminal-diagnostics.ts");
const heartbeat = read("capacitor-shell/lib/deviceHeartbeat.ts");
const api = read("src/routes/api/public/pos/device-heartbeat.ts");
const adminFunctions = read("src/lib/admin/company-admin.functions.ts");
const adminBusiness = read("src/routes/_adminApp/admin.businesses.$storeId.tsx");
const migration = read("supabase/migrations/20261006160000_admin_device_diagnostics.sql");

const cashierMessage = "Could not connect to the card reader. Please try again.";
assert(terminal.includes(cashierMessage), "cashier-safe reader error is missing");
assert(!heartbeat.includes('last_error: localStorage.getItem("pos.terminal.lastError")'), "terminal error still leaks into merchant status_snapshot");
assert(heartbeat.includes("device_diagnostic:"), "heartbeat does not send the separate diagnostic payload");
assert(api.includes('delete terminal.last_error'), "server does not strip terminal.last_error from merchant snapshots");
assert(api.includes('admin_device_diagnostics'), "heartbeat API does not persist admin diagnostics");
assert(adminFunctions.includes('admin_device_diagnostics'), "admin business workspace does not retrieve diagnostics");
assert(adminBusiness.includes("CONNECTION_TOKEN" ) || adminBusiness.includes("Connection token requested"), "Admin POS Devices does not display token-stage diagnostics");
assert(migration.includes("revoke all on table public.admin_device_diagnostics from public, anon, authenticated"), "diagnostic table is not locked away from merchant/client roles");
assert(migration.includes("grant select, insert, update, delete on table public.admin_device_diagnostics to service_role"), "server service-role grant is missing");

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

for (const marker of [
  "device[_ -]?secret",
  "actor[_ -]?token",
  "client[_ -]?secret",
  "employee[_ -]?pin",
]) {
  assert(diagnostics.toLowerCase().includes(marker), `redaction coverage missing for ${marker}`);
}

console.log("device diagnostics regression checks passed");
