import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "android-webdir", "assets");
const names = await readdir(dir);
let bundle = "";
for (const name of names) {
  if (name.endsWith(".js")) bundle += await readFile(path.join(dir, name), "utf8");
}
const marker = "SEZA-POS-PIN-COMPAT-2026-08-29-3";
if (!bundle.includes(marker)) {
  console.error(`[SEZA] STOP: compiled Android assets do not contain ${marker}.`);
  console.error("[SEZA] Do not install this APK. The build is using stale source files.");
  process.exit(1);
}
if (bundle.includes('Failed to fetch')) {
  console.warn('[SEZA] Note: a library bundle still contains the generic text "Failed to fetch"; SEZA cashier UI no longer surfaces it directly.');
}
console.log(`[SEZA] VERIFIED: ${marker} is present in compiled Android assets.`);
