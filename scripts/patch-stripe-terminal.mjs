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
const pluginPath = path.join(pluginRoot, "StripeTerminalPlugin.kt");

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

// A static, request-ID-bound callback survives a new plugin instance after a
// WebView reload. The native watchdog rejects even if JavaScript never responds.
let tokenProvider = readRequired(tokenProviderPath);
const tokenOriginal = tokenProvider;
tokenProvider = readRequired(path.join(process.cwd(), "scripts", "stripe-terminal", "TokenProvider.kt"));
const tokenChanged = writeIfChanged(tokenProviderPath, tokenOriginal, tokenProvider);

let terminal = readRequired(terminalPath);
const terminalOriginal = terminal;
let plugin = readRequired(pluginPath);
const pluginOriginal = plugin;

// 2) Expose Stripe Android SDK credential clearing through the Capacitor
// wrapper. This is required when the same physical Reader M2 moves from one
// SEZA merchant/connected account to another.
if (!plugin.includes("SEZA_PATCH_CLEAR_CACHED_CREDENTIALS")) {
  const wrapper = /(\n\s*@PluginMethod\s*\n\s*fun\s+disconnectReader\s*\(call:\s*PluginCall\)\s*\{\s*\n\s*implementation\.disconnectReader\(call\)\s*\n\s*\}\s*\n)/m;
  if (wrapper.test(plugin)) {
    plugin = plugin.replace(
      wrapper,
      `$1\n    // SEZA_PATCH_CLEAR_CACHED_CREDENTIALS\n    @PluginMethod\n    fun clearCachedCredentials(call: PluginCall) {\n        implementation.clearCachedCredentials(call)\n    }\n`,
    );
  } else {
    throw new Error("Stripe Terminal plugin wrapper changed; clearCachedCredentials could not be installed safely.");
  }
}


// 2b) Expose the one-shot connection-token callback through the Capacitor
// plugin bridge. The implementation method alone is not callable from JS:
// Capacitor only exposes @PluginMethod methods on StripeTerminalPlugin.
// Without this wrapper, Stripe can discover the physical M2 and request a
// token, but JS cannot deliver that token back to the pending native callback.
if (!plugin.includes("SEZA_PATCH_SET_CONNECTION_TOKEN")) {
  const wrapper = /(\n\s*@PluginMethod\s*\n\s*fun\s+disconnectReader\s*\(call:\s*PluginCall\)\s*\{\s*\n\s*implementation\.disconnectReader\(call\)\s*\n\s*\}\s*\n)/m;
  if (wrapper.test(plugin)) {
    plugin = plugin.replace(
      wrapper,
      `$1\n    // SEZA_PATCH_SET_CONNECTION_TOKEN\n    @PluginMethod\n    fun setConnectionToken(call: PluginCall) {\n        implementation.setConnectionToken(call)\n    }\n`,
    );
  } else {
    throw new Error("Stripe Terminal plugin wrapper changed; setConnectionToken could not be exposed safely.");
  }
}

if (!terminal.includes("SEZA_PATCH_CLEAR_CACHED_CREDENTIALS")) {
  const beforeReaderConnectors = /\n\s*private\s+fun\s+connectTapToPayReader\s*\(call:\s*PluginCall\)\s*\{/m;
  if (beforeReaderConnectors.test(terminal)) {
    terminal = terminal.replace(
      beforeReaderConnectors,
      `\n    // SEZA_PATCH_CLEAR_CACHED_CREDENTIALS\n    fun clearCachedCredentials(call: PluginCall) {\n        if (!isInitialized()) {\n            call.resolve()\n            return\n        }\n        if (Terminal.getInstance().connectedReader != null) {\n            call.reject("Disconnect the Stripe reader before clearing cached credentials.")\n            return\n        }\n        try {\n            Terminal.getInstance().clearCachedCredentials()\n            call.resolve()\n        } catch (ex: Exception) {\n            call.reject(ex.message ?: "Could not clear Stripe Terminal cached credentials.", ex)\n        }\n    }\n\n    private fun connectTapToPayReader(call: PluginCall) {`,
    );
  } else {
    throw new Error("Stripe Terminal implementation changed; clearCachedCredentials could not be installed safely.");
  }
}

// 3) Null-safe Bluetooth adapter. USB-only POS hardware can have no adapter.
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

// 7) Close the cancellation race between collectPaymentMethod() entering the
// Capacitor plugin and Stripe assigning its native Cancelable. Upstream 8.1.1
// first retrieves the PaymentIntent and only then sets collectCancelable. If
// the cashier presses Cancel during that retrieval window, upstream reports a
// successful cancel even though collection starts a moment later in the
// background. Remember the early cancel and reject the pending collect call
// before Stripe is allowed to start reading a card.
if (!terminal.includes("SEZA_PATCH_PAYMENT_CANCEL_RACE")) {
  terminal = terminal.replace(
    /(private\s+var\s+collectCancelable:\s*Cancelable\?\s*=\s*null)/,
    `$1\n    // SEZA_PATCH_PAYMENT_CANCEL_RACE\n    private var collectCancelRequested: Boolean = false`,
  );

  terminal = insertAfterFunctionHeader(
    terminal,
    /fun\s+collectPaymentMethod\s*\(call:\s*PluginCall\)\s*\{/m,
    `\n        // A fresh attempt must not inherit a cancel request from an older one.\n        this.collectCancelRequested = false`,
    () => false,
    "reset payment cancel request",
  );

  terminal = insertAfterFunctionHeader(
    terminal,
    /fun\s+cancelCollectPaymentMethod\s*\(call:\s*PluginCall\)\s*\{/m,
    `\n        // Mark cancellation even before Stripe has returned the native Cancelable.\n        this.collectCancelRequested = true`,
    () => false,
    "remember early payment cancellation",
  );

  const retrieveSuccess = /(private\s+val\s+createPaymentIntentCallback[\s\S]*?override\s+fun\s+onSuccess\s*\(paymentIntent:\s*PaymentIntent\)\s*\{)/m;
  if (retrieveSuccess.test(terminal)) {
    terminal = terminal.replace(
      retrieveSuccess,
      `$1\n                // SEZA_PATCH_PAYMENT_CANCEL_RACE\n                if (collectCancelRequested) {\n                    collectCancelRequested = false\n                    notifyListeners(TerminalEnumEvent.Canceled.webEventName, emptyObject)\n                    collectCall?.reject("Payment cancelled")\n                    collectCall = null\n                    return\n                }`,
    );
  } else {
    console.warn("[SEZA] payment cancel race: retrievePaymentIntent success callback not found; skipping callback guard.");
  }
}

// Propagate native discovery failures instead of leaving JS waiting for timeout.
if (!terminal.includes("SEZA_PATCH_DISCOVERY_FAILURE")) {
  const failure = /override fun onFailure\(e: TerminalException\) \{\s*Log\.d\(logTag, e\.localizedMessage\)\s*\}/;
  if (!failure.test(terminal)) throw new Error("Native discovery failure callback changed; review required.");
  terminal = terminal.replace(failure, `override fun onFailure(e: TerminalException) {
                        // SEZA_PATCH_DISCOVERY_FAILURE
                        call.reject("Stripe reader discovery failed", e.errorCode.toString(), e)
                    }`);
}
// 8) Initialization must finish on the UI thread BEFORE resolving. Upstream
// resolves while Terminal.init is still pending and drops isTest/tokenProvider
// when a new bridge instance probes an existing singleton.
if (!terminal.includes("SEZA_PATCH_INITIALIZE_V3")) {
  const start = terminal.indexOf("    @Throws(TerminalException::class)\n    fun initialize(call: PluginCall)");
  const end = terminal.indexOf("    fun setSimulatorConfiguration", start);
  if (start < 0 || end < 0) throw new Error("Stripe initialize source changed; review required.");
  terminal = terminal.slice(0, start) + `    // SEZA_PATCH_INITIALIZE_V3
    fun initialize(call: PluginCall) {
        this.isTest = call.getBoolean("isTest", false)
        activitySupplier.get().runOnUiThread {
            try {
                TokenProvider.bind(this.notifyListenersFunction)
                if (!isInitialized()) {
                    onCreate(contextSupplier.get().applicationContext as Application)
                    this.tokenProvider = TokenProvider(this.contextSupplier, "", this.notifyListenersFunction)
                    val listener = object : TerminalListener {
                        override fun onConnectionStatusChange(status: ConnectionStatus) {
                            notifyListeners(TerminalEnumEvent.ConnectionStatusChange.webEventName, JSObject().put("status", status.toString()))
                        }
                        override fun onPaymentStatusChange(status: PaymentStatus) {
                            notifyListeners(TerminalEnumEvent.PaymentStatusChange.webEventName, JSObject().put("status", status.toString()))
                        }
                    }
                    init(contextSupplier.get().applicationContext, LogLevel.NONE, this.tokenProvider!!, listener, null)
                }
                Terminal.getInstance()
                notifyListeners(TerminalEnumEvent.Loaded.webEventName, emptyObject)
                call.resolve()
            } catch (ex: Exception) {
                call.reject("Card reader service could not start", "NATIVE")
            }
        }
    }

    fun setConnectionToken(call: PluginCall) {
        TokenProvider.setConnectionToken(call)
    }

` + terminal.slice(end);
}

// 9) A Reader handle belongs to exactly one native discovery generation.
if (!terminal.includes("SEZA_PATCH_DISCOVERY_GENERATION")) {
  terminal = terminal.replace("    private var discoveredReadersList: List<Reader?>", `    // SEZA_PATCH_DISCOVERY_GENERATION
    private var discoveryGeneration = 0L
    private var discoveryActive = false
    private var discoveredReadersList: List<Reader?>`);
  const discoveryStart = "        this.locationId = call.getString(\"locationId\")";
  if (!terminal.includes(discoveryStart)) throw new Error("Stripe discovery source changed.");
  terminal = terminal.replace(discoveryStart, `        if (discoveryActive) { call.reject("Reader discovery is already running", "BUSY"); return }
        val generation = ++discoveryGeneration
        discoveredReadersList = emptyList()
        discoveryActive = true
` + discoveryStart);
  terminal = terminal.replace(/(override fun onUpdateDiscoveredReaders\(readers: List<Reader>\) \{)/, `$1
                        if (generation != discoveryGeneration || !discoveryActive) return
                        discoveredReadersList = readers`);
  terminal = terminal.replace("                        val i = 0\n                        for (reader in discoveredReadersList)", "                        var i = 0\n                        for (reader in discoveredReadersList)");
  terminal = terminal.replace('readersJSObject.put(convertReaderInterface(reader).put("index", i.toString()))', 'readersJSObject.put(convertReaderInterface(reader).put("index", (i++).toString()).put("discoveryId", generation.toString()))');
  terminal = terminal.replace('call.reject("Stripe reader discovery failed", e.errorCode.toString(), e)', `if (generation != discoveryGeneration) return
                        discoveryActive = false
                        discoveredReadersList = emptyList()
                        call.reject("Stripe reader discovery failed", e.errorCode.toString())`);
  const header = "    fun connectReader(call: PluginCall) {";
  terminal = terminal.replace(header, header + `
        val selected = call.getObject("reader")
        if (!discoveryActive || selected?.getString("discoveryId") != discoveryGeneration.toString()) {
            call.reject("Reader is no longer in the current discovery", "STALE_READER")
            return
        }
        val currentLocation = call.getString("locationId")
        if (currentLocation.isNullOrBlank()) { call.reject("Reader location is missing", "LOCATION"); return }
        this.locationId = currentLocation
`);
  terminal = terminal.replace("    fun cancelDiscoverReaders(call: PluginCall) {", `    fun cancelDiscoverReaders(call: PluginCall) {
        discoveryActive = false
        discoveryGeneration++
        discoveredReadersList = emptyList()
`);
  terminal = terminal.replace("    fun clearCachedCredentials(call: PluginCall) {", `    fun clearCachedCredentials(call: PluginCall) {
        TokenProvider.rejectPending()
        discoveryActive = false
        discoveryGeneration++
        discoveredReadersList = emptyList()
`);
  terminal = terminal.replace('Log.d(logTag, readers[0].serialNumber.toString())', '');
  const unknownType = '            call.unimplemented(call.getString("type") + " is not support now")';
  terminal = terminal.replace(unknownType, '            discoveryActive = false\n' + unknownType);
}

// 10) Mobile readers (USB and Bluetooth) need reconnect callbacks, too.
if (!terminal.includes("SEZA_PATCH_MOBILE_RECONNECT")) {
  const listener = "        return object : MobileReaderListener {";
  if (!terminal.includes(listener)) throw new Error("MobileReaderListener source changed.");
  terminal = terminal.replace(listener, listener + `
            // SEZA_PATCH_MOBILE_RECONNECT
            override fun onReaderReconnectStarted(reader: Reader, cancelReconnect: Cancelable, reason: DisconnectReason) {
                cancelReaderConnectionCancellable = cancelReconnect
                notifyListeners(TerminalEnumEvent.ReaderReconnectStarted.webEventName, JSObject().put("reason", reason.toString()))
            }
            override fun onReaderReconnectSucceeded(reader: Reader) {
                cancelReaderConnectionCancellable = null
                notifyListeners(TerminalEnumEvent.ReaderReconnectSucceeded.webEventName, JSObject().put("reader", convertReaderInterface(reader)))
            }
            override fun onReaderReconnectFailed(reader: Reader) {
                cancelReaderConnectionCancellable = null
                notifyListeners(TerminalEnumEvent.ReaderReconnectFailed.webEventName, emptyObject)
            }
`);
  terminal = terminal.replace(/e\.printStackTrace\(\)\s+call\.reject\(e\.localizedMessage, e\)/, 'call.reject("Card reader connection failed", e.errorCode.toString())');
  terminal = terminal.replace('eventObject.put("error", e.localizedMessage)', 'eventObject.put("error", e.errorCode.toString())');
}

// 11) Stripe 5.x returns a result when credential clearing fails; it does
// not always throw. Never adopt the next merchant after a failed clear.
if (!terminal.includes("SEZA_PATCH_CLEAR_RESULT")) {
  terminal = terminal.replace(`            Terminal.getInstance().clearCachedCredentials()
            call.resolve()`, `            // SEZA_PATCH_CLEAR_RESULT
            val result = Terminal.getInstance().clearCachedCredentials()
            if (result.error != null) { call.reject("Reader credentials could not be reset", "RESET"); return }
            call.resolve()`);
}
// Keep mobile callbacks bound to the current bridge across WebView reloads,
// and discard callbacks from a merchant whose native credentials were cleared.
if (!terminal.includes("SEZA_PATCH_MOBILE_EVENT_EPOCH")) {
  const start = terminal.indexOf("    private fun readerListener(): MobileReaderListener {");
  const end = terminal.indexOf("    fun setTapToPayUxConfiguration", start);
  if (start < 0 || end < 0) throw new Error("Mobile listener source changed.");
  let mobile = terminal.slice(start, end);
  mobile = mobile.replace("        return object : MobileReaderListener {", `        // SEZA_PATCH_MOBILE_EVENT_EPOCH
        val merchantEpoch = TokenProvider.merchantEpoch
        return object : MobileReaderListener {`);
  mobile = mobile.replaceAll("notifyListeners(", "TokenProvider.notifyReaderEvent(merchantEpoch, ");
  terminal = terminal.slice(0, start) + mobile + terminal.slice(end);
}

if (!/@PluginMethod\s+fun\s+setConnectionToken\s*\(call:\s*PluginCall\)/m.test(plugin)) {
  throw new Error("SEZA Stripe Terminal token bridge is missing @PluginMethod setConnectionToken.");
}
if (!/fun\s+setConnectionToken\s*\(call:\s*PluginCall\)\s*\{\s*TokenProvider\.setConnectionToken\(call\)/m.test(terminal)) {
  throw new Error("SEZA Stripe Terminal token implementation is missing.");
}

const terminalChanged = writeIfChanged(terminalPath, terminalOriginal, terminal);
const pluginChanged = writeIfChanged(pluginPath, pluginOriginal, plugin);

console.log(
  `[SEZA] Stripe Terminal Android safety patch ${tokenChanged || terminalChanged || pluginChanged ? "applied" : "already satisfied"}.`,
);

