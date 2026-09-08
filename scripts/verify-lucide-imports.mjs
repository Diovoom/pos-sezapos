import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const lucide = await import("lucide-react");
const allowed = new Set(Object.keys(lucide));
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const missing = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;

    const source = fs.readFileSync(full, "utf8");
    const re = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g;
    for (const match of source.matchAll(re)) {
      for (const raw of match[1].split(",")) {
        const spec = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
        if (!spec || spec.startsWith("type ")) continue;
        const imported = spec.split(/\s+as\s+/i)[0].trim();
        if (imported && !allowed.has(imported)) {
          missing.push({ file: path.relative(root, full), imported });
        }
      }
    }
  }
}

if (!fs.existsSync(srcRoot)) {
  console.error("SEZA icon verification failed: src directory was not found.");
  process.exit(1);
}

walk(srcRoot);

if (missing.length) {
  console.error("\nSEZA release blocked: invalid lucide-react import(s):");
  for (const item of missing) console.error(`  ${item.file}: ${item.imported}`);
  console.error("\nFix these imports before committing or pushing.\n");
  process.exit(1);
}

console.log("SEZA icon verification passed.");
