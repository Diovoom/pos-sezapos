import fs from "node:fs";
import path from "node:path";

const pluginRoot = path.join(
  process.cwd(),
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
);

const tokenProviderPath = path.join(pluginRoot, "TokenProvider.kt");
const terminalPath = path.join(pluginRoot, "StripeTerminal.kt");

function readRequired(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Stripe Terminal Android source was not found at ${file}. Run npm install first.`);
  }
  return fs.readFileSync(file, "utf8");
}

function writeIfChanged(file, before, after) {
  if (before === after) return false;
  fs.writeFileSync(file, after, "utf8");
  return true;
}

function insertAfterFunctionHeader(source, signatureRegex, insertion, alreadySafe, label) {
  if (alreadySafe(source)) return source;
  const match = source.match(signatureRegex);
  if (!match || match.index == null) {
    console.warn(`[SEZA] ${label}: upstream source shape changed; no unsafe target was found, skipping.`);
    return source;
  }
  const at = match.index + match[0].length;
  return source.slice(0, at) + insertion + source.slice(at);
}

// 1) Keep the pending Stripe connection-token callback shared across Capacitor
// plugin instances/WebView reloads. Older SEZA patches may already have done this
// with slightly different whitespace, so detect behavior instead of exact text.
let tokenProvider = readRequired(tokenProviderPath);
const tokenOriginal = tokenProvider;
if (!tokenProvider.includes("SEZA_PATCH_SHARED_PENDING_CALLBACKS")) {
  if (/companion\s+object\s*\{[\s\S]*pendingCallback\s*:\s*ArrayList<ConnectionTokenCallback>/m.test(tokenProvider)) {
    console.log("[SEZA] shared pending connection-token callback already present.");
  } else {
    const pendingField = /^\s*private\s+var\s+pendingCallback\s*:\s*ArrayList<ConnectionTokenCallback>\s*=\s*ArrayList\(\)\s*$/m;
    if (pendingField.test(tokenProvider)) {
      tokenProvider = tokenProvider.replace(
        pendingField,
        `    // SEZA_PATCH_SHARED_PENDING_CALLBACKS\n    companion object {\n        private val pendingCallback: ArrayList<ConnectionTokenCallback> = ArrayList()\n    }`,
      );
    } else {
      console.warn("[SEZA] shared token callback: no unsafe instance field found; skipping.");
    }
  }
}
const tokenChanged = writeIfChanged(tokenProviderPath, tokenOriginal, tokenProvider);

let terminal = readRequired(terminalPath);
const terminalOriginal = terminal;

// 2) Null-safe Bluetooth adapter. USB-only POS hardware can have no adapter.
if (!terminal.includes("SEZA_PATCH_SAFE_BLUETOOTH_ADAPTER")) {
  if (/bluetooth\s*!=\s*null\s*&&\s*!bluetooth\.isEnabled/.test(terminal)) {
    console.log("[SEZA] Bluetooth adapter guard already present.");
  } else {
    terminal = terminal.replace(
      /(val\s+bluetooth\s*=\s*BluetoothAdapter\.getDefaultAdapter\(\)\s*\r?\n\s*)if\s*\(\s*!bluetooth\.isEnabled\s*\)\s*\{/,
      `$1// SEZA_PATCH_SAFE_BLUETOOTH_ADAPTER\n        if (bluetooth != null && !bluetooth.isEnabled) {`,
    );
  }
}

// 3) Empty reader discovery guard. Do NOT require readers[0] to be the next
// statement: earlier patches/plugin updates can insert logging or comments.
if (!terminal.includes("SEZA_PATCH_EMPTY_DISCOVERY_GUARD")) {
  const discoveryAlreadySafe = /override\s+fun\s+onUpdateDiscoveredReaders\s*\(readers:\s*List<Reader>\)\s*\{[\s\S]{0,500}?readers\.isEmpty\(\)/m.test(terminal);
  if (discoveryAlreadySafe) {
    console.log("[SEZA] empty reader discovery guard already present.");
  } else {
    terminal = insertAfterFunctionHeader(
      terminal,
      /override\s+fun\s+onUpdateDiscoveredReaders\s*\(readers:\s*List<Reader>\)\s*\{/m,
      `\n                        // SEZA_PATCH_EMPTY_DISCOVERY_GUARD\n                        if (readers.isEmpty()) {\n                            return\n                        }`,
      () => false,
      "empty reader discovery guard",
    );
  }
}

// 4) Pre-init getConnectedReader must REJECT. Returning successful null makes
// SEZA think a native Terminal singleton exists and it skips initialize().
const oldSafeConnectedReader = /\s*\/\/ SEZA_PATCH_SAFE_CONNECTED_READER\s*\r?\n\s*if\s*\(!isInitialized\(\)\)\s*\{\s*\r?\n\s*call\.resolve\(JSObject\(\)\.put\("reader",\s*JSObject\.NULL\)\)\s*\r?\n\s*return\s*\r?\n\s*\}/m;
if (oldSafeConnectedReader.test(terminal)) {
  terminal = terminal.replace(
    oldSafeConnectedReader,
    `\n        // SEZA_PATCH_SAFE_CONNECTED_READER_V2\n        if (!isInitialized()) {\n            call.reject("Stripe Terminal is not initialized yet.")\n            return\n        }`,
  );
}
terminal = insertAfterFunctionHeader(
  terminal,
  /fun\s+getConnectedReader\s*\(call:\s*PluginCall\)\s*\{/m,
  `\n        // SEZA_PATCH_SAFE_CONNECTED_READER_V2\n        if (!isInitialized()) {\n            call.reject("Stripe Terminal is not initialized yet.")\n            return\n        }`,
  (s) => /fun\s+getConnectedReader\s*\(call:\s*PluginCall\)\s*\{[\s\S]{0,450}?if\s*\(!isInitialized\(\)\)[\s\S]{0,200}?call\.reject/m.test(s),
  "safe getConnectedReader",
);

// 5) disconnectReader before initialize must be a harmless no-op.
terminal = insertAfterFunctionHeader(
  terminal,
  /fun\s+disconnectReader\s*\(call:\s*PluginCall\)\s*\{/m,
  `\n        // SEZA_PATCH_SAFE_DISCONNECT_READER\n        if (!isInitialized()) {\n            call.resolve()\n            return\n        }`,
  (s) => /fun\s+disconnectReader\s*\(call:\s*PluginCall\)\s*\{[\s\S]{0,400}?if\s*\(!isInitialized\(\)\)/m.test(s),
  "safe disconnectReader",
);

// 6) Never start discovery before Stripe Terminal initialize() completes.
terminal = insertAfterFunctionHeader(
  terminal,
  /fun\s+onDiscoverReaders\s*\(call:\s*PluginCall\)\s*\{/m,
  `\n        // SEZA_PATCH_SAFE_DISCOVER_BEFORE_INIT\n        if (!isInitialized()) {\n            call.reject("Stripe Terminal is not initialized yet.")\n            return\n        }`,
  (s) => /fun\s+onDiscoverReaders\s*\(call:\s*PluginCall\)\s*\{[\s\S]{0,450}?if\s*\(!isInitialized\(\)\)/m.test(s),
  "safe discover before init",
);

const terminalChanged = writeIfChanged(terminalPath, terminalOriginal, terminal);

console.log(
  `[SEZA] Stripe Terminal Android safety patch ${tokenChanged || terminalChanged ? "applied" : "already satisfied"}.`,
);
