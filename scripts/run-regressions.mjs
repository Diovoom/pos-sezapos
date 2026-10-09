// One local/CI entry point. Every suite uses mocks or an ephemeral database.
import { spawnSync } from "node:child_process";
const suites = [
  "m2-reliability-regression.cjs", "m2-setup-regression.cjs", "merchant-risk-regression.cjs",
  "remaining-merchant-regression.cjs", "remaining-merchant-db.mjs", "prelaunch-db.mjs",
  "support-lifecycle-regression.cjs", "android-lifecycle-regression.cjs",
  "web-regression.cjs", "device-diagnostics-regression.cjs", "prelaunch-regression.cjs",
  "signup-trigger-regression.cjs", "owner-setup-regression.cjs",
];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [`scripts/${suite}`], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
