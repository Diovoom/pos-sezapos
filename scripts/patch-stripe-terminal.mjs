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

// Fix the token-provider handoff seen in the SEZA logs. Stripe's native singleton
// can keep the original TokenProvider while Capacitor creates a new JS/plugin-side
// provider after a reload. Sharing the pending callback queue lets the new plugin
// instance fulfill the callback that Stripe issued to the original provider.
let tokenProvider = readRequired(tokenProviderPath);
const tokenOriginal = tokenProvider;
if (!tokenProvider.includes("SEZA_PATCH_SHARED_PENDING_CALLBACKS")) {
  const needle = "    private var pendingCallback: ArrayList<ConnectionTokenCallback> = ArrayList()";
  if (!tokenProvider.includes(needle)) {
    throw new Error("Stripe Terminal TokenProvider.kt changed; pendingCallback patch target was not found.");
  }
  tokenProvider = tokenProvider.replace(
    needle,
    `    // SEZA_PATCH_SHARED_PENDING_CALLBACKS\n    companion object {\n        private val pendingCallback: ArrayList<ConnectionTokenCallback> = ArrayList()\n    }`,
  );
}
const tokenChanged = writeIfChanged(tokenProviderPath, tokenOriginal, tokenProvider);

// getConnectedReader() in the community plugin calls Terminal.getInstance()
// directly. During a fresh Android boot SEZA can probe reader status before Stripe
// has been initialized. Return reader=null instead of letting that native call crash
// the Capacitor plugin/application process.
let terminal = readRequired(terminalPath);
const terminalOriginal = terminal;
if (!terminal.includes("SEZA_PATCH_SAFE_CONNECTED_READER")) {
  const needle =
    "    fun getConnectedReader(call: PluginCall) {\n        val reader: Reader? = Terminal.getInstance().connectedReader";
  if (!terminal.includes(needle)) {
    throw new Error("Stripe Terminal StripeTerminal.kt changed; getConnectedReader patch target was not found.");
  }
  terminal = terminal.replace(
    needle,
    `    fun getConnectedReader(call: PluginCall) {\n        // SEZA_PATCH_SAFE_CONNECTED_READER\n        if (!isInitialized()) {\n            call.resolve(JSObject().put("reader", JSObject.NULL))\n            return\n        }\n        val reader: Reader? = Terminal.getInstance().connectedReader`,
  );
}
const terminalChanged = writeIfChanged(terminalPath, terminalOriginal, terminal);

console.log(
  `[SEZA] Stripe Terminal Android safety patch ${tokenChanged || terminalChanged ? "applied" : "already applied"}.`,
);
