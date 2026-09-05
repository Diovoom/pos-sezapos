import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "android-webdir", "assets");
const names = await readdir(dir);
let bundle = "";

for (const name of names) {
  if (name.endsWith(".js")) bundle += await readFile(path.join(dir, name), "utf8");
}

if (!bundle.includes("Loading register") || !bundle.includes("Could not connect to SEZA")) {
  console.error("[SEZA] Android assets are incomplete.");
  process.exit(1);
}

console.log("[SEZA] Android assets verified.");
