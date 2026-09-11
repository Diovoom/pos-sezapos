import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// SEZA POS hotfix for @capacitor-community/stripe-terminal 8.1.x Android discovery.
// The upstream bridge reads readers[0] even when Stripe reports an empty list,
// and its discovery failure callback only logs instead of rejecting the
// Capacitor call. Both behaviors can leave the POS on "Discovering reader".

const root = process.cwd();
const bridge = path.join(
  root,
  "node_modules",
  "@capacitor-community",
  "stripe-terminal",
  "android",
  "src",
  "main",
  "java",
  "com",
  "getcapacitor",
  "community",
  "stripe",
  "terminal",
  "StripeTerminal.kt",
);

let source;
try {
  source = await readFile(bridge, "utf8");
} catch {
  console.error(`[SEZA] Stripe Terminal Android bridge not found: ${bridge}`);
  console.error("[SEZA] Run npm install from the project root, then run this command again.");
  process.exit(1);
}

let patched = source;

const unsafeReaderLog = 'Log.d(logTag, readers[0].serialNumber.toString())';
const emptyReaderGuard = `if (readers.isEmpty()) {
                    Log.d(logTag, "No Stripe Terminal readers discovered yet")
                    return
                }`;

if (!patched.includes("No Stripe Terminal readers discovered yet")) {
  if (!patched.includes(unsafeReaderLog)) {
    console.error("[SEZA] Stripe Terminal discovery code changed; refusing to apply an unsafe blind patch.");
    process.exit(1);
  }
  patched = patched.replace(
    unsafeReaderLog,
    `${emptyReaderGuard}\n                ${unsafeReaderLog}`,
  );
}

const failureLog = 'Log.d(logTag, e.localizedMessage)';
const failureReject = 'call.reject(e.localizedMessage ?: "Stripe reader discovery failed.", e)';

if (!patched.includes(failureReject)) {
  const discoveryStart = patched.indexOf("fun onDiscoverReaders(call: PluginCall)");
  const discoveryEnd = patched.indexOf("fun connectReader(call: PluginCall)", discoveryStart);
  if (discoveryStart < 0 || discoveryEnd < 0) {
    console.error("[SEZA] Could not locate the Stripe Terminal discovery callback.");
    process.exit(1);
  }

  const discoveryBlock = patched.slice(discoveryStart, discoveryEnd);
  const failureIndex = discoveryBlock.lastIndexOf(failureLog);
  if (failureIndex < 0) {
    console.error("[SEZA] Could not locate the Stripe Terminal discovery failure handler.");
    process.exit(1);
  }

  const absoluteIndex = discoveryStart + failureIndex;
  patched =
    patched.slice(0, absoluteIndex) +
    `${failureLog}\n                        ${failureReject}` +
    patched.slice(absoluteIndex + failureLog.length);
}

if (patched === source) {
  console.log("[SEZA] Stripe Terminal Android discovery bridge is already patched.");
} else {
  await writeFile(bridge, patched, "utf8");
  console.log("[SEZA] Stripe Terminal Android discovery bridge patched successfully.");
}
