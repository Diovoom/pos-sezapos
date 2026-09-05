import { rm, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

// SEZA Android build helper for Windows/PrimeOS development.
// Avoid spawning npx.cmd directly (can fail with EINVAL on some Windows setups).
// Invoke Capacitor's CLI with the current Node executable instead.

const root = process.cwd();
const generatedCordova = path.join(root, "android", "capacitor-cordova-android-plugins");

try {
  await rm(generatedCordova, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
} catch {
  console.warn("[SEZA] Could not fully remove old generated Cordova folder; continuing.");
}

const capacitorCli = path.join(
  root,
  "node_modules",
  "@capacitor",
  "cli",
  "bin",
  "capacitor"
);

try {
  await access(capacitorCli);
} catch {
  console.error(`[SEZA] Capacitor CLI not found at: ${capacitorCli}`);
  console.error("[SEZA] Run npm install from the project root, then try again.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [capacitorCli, "sync", "android"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error("[SEZA] Capacitor sync failed:", result.error);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("[SEZA] Android assets/config synced successfully.");
