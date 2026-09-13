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

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`Stripe Terminal source changed; ${label} patch target was not found.`);
  }
  return source.replace(needle, replacement);
}

// Stripe can keep the original native TokenProvider across a WebView reload while
// Capacitor creates a new plugin-side provider. A shared queue lets the current
// JS instance deliver a token to the callback that Stripe actually requested.
let tokenProvider = readRequired(tokenProviderPath);
const tokenOriginal = tokenProvider;
if (!tokenProvider.includes("SEZA_PATCH_SHARED_PENDING_CALLBACKS")) {
  tokenProvider = replaceRequired(
    tokenProvider,
    "    private var pendingCallback: ArrayList<ConnectionTokenCallback> = ArrayList()",
    `    // SEZA_PATCH_SHARED_PENDING_CALLBACKS\n    companion object {\n        private val pendingCallback: ArrayList<ConnectionTokenCallback> = ArrayList()\n    }`,
    "shared pending connection-token callback",
  );
}
const tokenChanged = writeIfChanged(tokenProviderPath, tokenOriginal, tokenProvider);

let terminal = readRequired(terminalPath);
const terminalOriginal = terminal;

// Some POS hardware can report no Bluetooth adapter. The upstream plugin uses
// bluetooth.isEnabled without a null check during initialize(), which can kill
// the Android process before USB Reader M2 setup even starts.
if (!terminal.includes("SEZA_PATCH_SAFE_BLUETOOTH_ADAPTER")) {
  terminal = replaceRequired(
    terminal,
    `        val bluetooth = BluetoothAdapter.getDefaultAdapter()\n        if (!bluetooth.isEnabled) {`,
    `        // SEZA_PATCH_SAFE_BLUETOOTH_ADAPTER\n        val bluetooth = BluetoothAdapter.getDefaultAdapter()\n        if (bluetooth != null && !bluetooth.isEnabled) {`,
    "Bluetooth adapter null guard",
  );
}

// Stripe Terminal can publish an empty discovery update before the USB M2 appears.
// The upstream plugin dereferences readers[0], which throws on that empty update
// and closes the entire SEZA Android app. Ignore empty updates and keep discovery
// alive until the real reader arrives or SEZA's own timeout expires.
if (!terminal.includes("SEZA_PATCH_EMPTY_DISCOVERY_GUARD")) {
  terminal = replaceRequired(
    terminal,
    `                    override fun onUpdateDiscoveredReaders(readers: List<Reader>) {\n                        Log.d(logTag, readers[0].serialNumber.toString())`,
    `                    override fun onUpdateDiscoveredReaders(readers: List<Reader>) {\n                        // SEZA_PATCH_EMPTY_DISCOVERY_GUARD\n                        if (readers.isEmpty()) {\n                            return\n                        }\n                        Log.d(logTag, readers[0].serialNumber.toString())`,
    "empty reader discovery guard",
  );
}

// Never let a Capacitor call reach Terminal.getInstance() before Stripe has been
// initialized. Capacitor wraps native exceptions as a fatal plugin-thread crash,
// so catching the Promise in JS is not enough.
if (!terminal.includes("SEZA_PATCH_SAFE_CONNECTED_READER")) {
  terminal = replaceRequired(
    terminal,
    `    fun getConnectedReader(call: PluginCall) {\n        val reader: Reader? = Terminal.getInstance().connectedReader`,
    `    fun getConnectedReader(call: PluginCall) {\n        // SEZA_PATCH_SAFE_CONNECTED_READER\n        if (!isInitialized()) {\n            call.resolve(JSObject().put("reader", JSObject.NULL))\n            return\n        }\n        val reader: Reader? = Terminal.getInstance().connectedReader`,
    "safe getConnectedReader",
  );
}

if (!terminal.includes("SEZA_PATCH_SAFE_DISCONNECT_READER")) {
  terminal = replaceRequired(
    terminal,
    `    fun disconnectReader(call: PluginCall) {\n        if (Terminal.getInstance().connectedReader == null) {`,
    `    fun disconnectReader(call: PluginCall) {\n        // SEZA_PATCH_SAFE_DISCONNECT_READER\n        if (!isInitialized()) {\n            call.resolve()\n            return\n        }\n        if (Terminal.getInstance().connectedReader == null) {`,
    "safe disconnectReader",
  );
}

// Defensive native guard: discovery should only run after initialize(). If a
// lifecycle race slips through, reject the call instead of crashing the app.
if (!terminal.includes("SEZA_PATCH_SAFE_DISCOVER_BEFORE_INIT")) {
  terminal = replaceRequired(
    terminal,
    `    fun onDiscoverReaders(call: PluginCall) {\n        if (ActivityCompat.checkSelfPermission(`,
    `    fun onDiscoverReaders(call: PluginCall) {\n        // SEZA_PATCH_SAFE_DISCOVER_BEFORE_INIT\n        if (!isInitialized()) {\n            call.reject("Stripe Terminal is not initialized yet.")\n            return\n        }\n        if (ActivityCompat.checkSelfPermission(`,
    "safe discover before init",
  );
}

const terminalChanged = writeIfChanged(terminalPath, terminalOriginal, terminal);

console.log(
  `[SEZA] Stripe Terminal Android safety patch ${tokenChanged || terminalChanged ? "applied" : "already applied"}.`,
);
