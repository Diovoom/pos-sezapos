import type { TerminalDriverId } from "./index";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { readMeta } from "@/lib/offline/db";
import { userFacingError } from "@/lib/errors/user-facing";
import type { TerminalCheckout } from "@/lib/pos/terminal-checkout";
import {
  beginStripeTerminalDiagnostic,
  failStripeTerminalDiagnostic,
  markStripeTerminalDiagnostic,
  succeedStripeTerminalDiagnostic,
  type StripeTerminalDiagnosticStage,
} from "./terminal-diagnostics";

const REMOTE_API = "https://sezapos.com";
const CARD_READER_CONNECTION_ERROR = "Could not connect to the card reader. Please try again.";

type StripeModule = typeof import("@capacitor-community/stripe-terminal");
type NativeAuth = {
  store_id: string;
  device_id: string;
  device_secret: string;
  caller_id: string;
  actor_token: string | null;
};

export type StripeTerminalRecord = {
  id: string;
  store_id: string;
  label: string;
  provider: string;
  serial: string | null;
  location: string | null;
  status: string;
  last_seen_at: string | null;
  stripe_reader_id?: string | null;
  stripe_connected_account_id?: string | null;
  stripe_terminal_location_id?: string | null;
  config?: Record<string, unknown> | null;
};

export type StripeTerminalContext = {
  ready: boolean;
  connectStatus: string;
  cardPaymentsStatus: string | null;
  terminalLocationReady: boolean;
  locationId: string | null;
  environment: "sandbox" | "live";
  terminals: StripeTerminalRecord[];
};

type TerminalConfiguration = {
  terminalId: string;
  driver: TerminalDriverId;
  locationId: string;
  testMode: boolean;
  connectionMethod: "usb" | "bluetooth";
  serial?: string | null;
};

type StripeTerminalRuntimeState = {
  modulePromise: Promise<StripeModule> | null;
  // JS can reload while the Android Stripe Terminal singleton stays alive.
  // Track native initialization separately so we never call initialize() twice
  // and replace the plugin TokenProvider that owns Stripe's pending callback.
  nativeInitialized: boolean;
  initializedMode: boolean | null;
  initializePromise: Promise<StripeModule> | null;
  tokenListenerPromise: Promise<void> | null;
  tokenDeliveryQueue: Promise<void>;
  connected: { terminalId: string; driver: TerminalDriverId; serial: string } | null;
  readerConnectPromise: Promise<{ mod: StripeModule; reader: any }> | null;
  paymentInFlight: boolean;
  paymentAttemptId: number;
  cancelRequestedFor: number | null;
  paymentStage: "idle" | "preparing" | "collecting" | "confirming";
  paymentSettledPromise: Promise<void> | null;
  resolvePaymentSettled: (() => void) | null;
};

const STRIPE_RUNTIME_KEY = "__sezaStripeTerminalRuntime";

function stripeRuntime(): StripeTerminalRuntimeState {
  const root = globalThis as typeof globalThis & {
    [STRIPE_RUNTIME_KEY]?: StripeTerminalRuntimeState;
  };

  root[STRIPE_RUNTIME_KEY] ??= {
    modulePromise: null,
    nativeInitialized: false,
    initializedMode: null,
    initializePromise: null,
    tokenListenerPromise: null,
    tokenDeliveryQueue: Promise.resolve(),
    connected: null,
    readerConnectPromise: null,
    paymentInFlight: false,
    paymentAttemptId: 0,
    cancelRequestedFor: null,
    paymentStage: "idle",
    paymentSettledPromise: null,
    resolvePaymentSettled: null,
  };

  // Keep hot reloads / an already-running WebView compatible with the newer
  // runtime shape. The object is intentionally stored on globalThis so native
  // Stripe state survives module reloads.
  const runtime = root[STRIPE_RUNTIME_KEY]!;
  runtime.paymentAttemptId ??= 0;
  runtime.cancelRequestedFor ??= null;
  runtime.paymentStage ??= "idle";
  runtime.paymentSettledPromise ??= null;
  runtime.resolvePaymentSettled ??= null;

  return runtime;
}

const CONNECTION_METHOD_PREFIX = "pos.stripe.connectionMethod.";

export function setStripeReaderConnectionMethod(
  terminalId: string,
  method: "usb" | "bluetooth",
) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${CONNECTION_METHOD_PREFIX}${terminalId}`, method);
}

export function getStripeReaderConnectionMethod(
  terminalId: string,
): "usb" | "bluetooth" | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(`${CONNECTION_METHOD_PREFIX}${terminalId}`);
  return value === "usb" || value === "bluetooth" ? value : null;
}

export function clearStripeReaderConnectionMethod(terminalId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(`${CONNECTION_METHOD_PREFIX}${terminalId}`);
}

/**
 * Reset native Stripe Terminal account state before this Android install is
 * paired to a different SEZA merchant. Stripe caches account credentials in
 * the native Terminal singleton, which can outlive JS/WebView and store
 * pairing changes. Disconnect first, clear the SDK credentials, then let the
 * next discovery request a token for the newly paired merchant.
 */
export async function resetStripeTerminalForMerchantSwitch(): Promise<void> {
  if (!isNativeMode()) return;

  const runtime = stripeRuntime();
  beginStripeTerminalDiagnostic("MERCHANT_RESET");
  try {
    const mod = await loadModule();
    markStripeTerminalDiagnostic("MERCHANT_RESET", { stripe_plugin_linked: true });
    // Finish any token delivery already requested under the previous pairing
    // before clearing the SDK cache, otherwise an old token could land after
    // the clear and contaminate the new merchant session.
    await runtime.tokenDeliveryQueue.catch(() => undefined);
    const existing = await probeNativeReader(mod);
    if (existing) {
      await mod.StripeTerminal.disconnectReader().catch(() => undefined);
    }

    const clearCachedCredentials = (mod.StripeTerminal as any).clearCachedCredentials;
    if (typeof clearCachedCredentials === "function") {
      await clearCachedCredentials.call(mod.StripeTerminal);
    }
  } catch (error) {
    failStripeTerminalDiagnostic("MERCHANT_RESET", error);
    // Pairing the register itself must remain usable even if an older APK or
    // plugin cannot clear Stripe state. The new build exposes this native call;
    // logging here preserves diagnostics without trapping the device in pairing.
    if (import.meta.env.DEV) {
      console.warn("[SEZA Terminal] merchant-switch credential reset deferred", error);
    }
  } finally {
    runtime.connected = null;
    runtime.readerConnectPromise = null;
    runtime.paymentInFlight = false;
    runtime.cancelRequestedFor = null;
    runtime.paymentStage = "idle";
    runtime.paymentSettledPromise = null;
    runtime.resolvePaymentSettled = null;

    if (typeof localStorage !== "undefined") {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(CONNECTION_METHOD_PREFIX)) localStorage.removeItem(key);
      }
      localStorage.removeItem("pos.terminal.connectedAt");
      localStorage.removeItem("pos.terminal.lastError");
      localStorage.removeItem("pos.terminal.rawError");
    }

    try {
      const [{ setActiveTerminal }, { setActivePaymentProvider }] = await Promise.all([
        import("./index"),
        import("@/lib/pos/payment-terminal"),
      ]);
      setActiveTerminal("none");
      setActivePaymentProvider(null);
    } catch {
      // The pairing screen can run before the full POS hardware bundle loads.
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("seza:device-config-changed"));
    }
  }
}

function apiBase() {
  if (typeof window === "undefined") return REMOTE_API;
  return isNativeMode() ? REMOTE_API : window.location.origin;
}

async function nativeAuth(): Promise<NativeAuth | null> {
  if (!isNativeMode()) return null;
  const [{ getPairing }, callerId] = await Promise.all([
    import("../../../capacitor-shell/lib/pairing"),
    readMeta<string>("authenticated_me_current_user"),
  ]);
  const pairing = getPairing();
  if (!pairing || !callerId) return null;
  return {
    store_id: pairing.storeId,
    device_id: pairing.deviceId,
    device_secret: pairing.deviceSecret,
    caller_id: callerId,
    actor_token: await readMeta<string>(`actor_token:${callerId}`) ?? null,
  };
}

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your employee session has expired. Sign in again.");
  return token;
}

async function callApi<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  let request = fetch;
  let payload: Record<string, unknown> = body;

  if (isNativeMode()) {
    const auth = await nativeAuth();
    if (!auth) throw new Error("The register session is unavailable. Enter the employee PIN again.");
    request = (await import("../../../capacitor-shell/lib/nativeHttp")).nativeFetch;
    payload = { ...body, nativeAuth: auth };
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id === auth.caller_id) headers.authorization = `Bearer ${data.session.access_token}`;
  } else {
    headers.authorization = `Bearer ${await bearer()}`;
  }

  const response = await request(`${apiBase()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((result as any)?.error || `SEZA payment service error ${response.status}`));
  }
  return result as T;
}

export function recoverStripeCheckout(action: "recover" | "acknowledge" | "abandon" = "recover", checkoutId?: string) {
  return callApi<{checkouts: {checkoutId: string; status: string; sale?: any; message?: string}[]}>(
    "/api/public/pos/stripe-terminal/payment-result",{action,checkoutId});
}

export async function getStripeTerminalContext(): Promise<StripeTerminalContext> {
  return callApi<StripeTerminalContext>("/api/public/pos/stripe-terminal/context");
}

export async function saveStripeTerminal(input: {
  label: string;
  model: string;
  serial?: string;
  location?: string;
  readerType: TerminalDriverId;
  connectionMethod?: "usb" | "bluetooth";
}) {
  return callApi<{ ok: true; terminals: StripeTerminalRecord[] }>(
    "/api/public/pos/stripe-terminal/reader",
    { action: "save", ...input },
  );
}

export async function updateStripeTerminal(
  action: "activate" | "connected" | "disconnected" | "remove" | "connection_method",
  terminalId: string,
  extra: Record<string, unknown> = {},
) {
  return callApi<{ ok: true; terminals: StripeTerminalRecord[] }>(
    "/api/public/pos/stripe-terminal/reader",
    { action, terminalId, ...extra },
  );
}

export async function refundStripeSale(input: {
  request: { id: string; sale_id: string; type: string; reason: string; notes: string | null; restock: boolean; items: Array<{ sale_item_id: string; quantity: number }> };
  approvalToken?: string;
}) {
  return callApi<{ refund: { id: string; total: number; status: string; created_at: string }; effectiveItems: Array<{ sale_item_id: string; quantity: number }> }>("/api/public/pos/stripe-terminal/refund", input);
}

async function fetchConnectionToken() {
  const result = await callApi<{ secret: string }>("/api/public/pos/stripe-terminal/connection-token");
  if (!result.secret) throw new Error("Stripe Terminal connection token was empty");
  return result.secret;
}

async function recordPaymentResult(reference: string, status: "completed" | "failed", message: string) {
  await callApi("/api/public/pos/stripe-terminal/payment-result", { reference, status, message }).catch(() => undefined);
}

type StripeIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "canceled"
  | "succeeded"
  | string;

async function readPaymentIntentStatus(reference: string) {
  return callApi<{ ok: true; status: StripeIntentStatus; last_payment_error?: string | null }>(
    "/api/public/pos/stripe-terminal/payment-result",
    { action: "status", reference },
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function reconcilePaymentIntent(reference: string) {
  let latest: Awaited<ReturnType<typeof readPaymentIntentStatus>> | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    latest = await readPaymentIntentStatus(reference).catch(() => null);
    if (latest?.status === "succeeded" || latest?.status === "requires_capture") return latest;
    if (latest?.status === "canceled" || latest?.status === "requires_payment_method") return latest;
    await delay(750);
  }
  return latest;
}

async function confirmCollectedPayment(mod: StripeModule, reference: string) {
  let confirmedListener: { remove: () => Promise<void> } | null = null;

  let resolveConfirmed!: () => void;
  const confirmedEvent = new Promise<void>((resolve) => { resolveConfirmed = resolve; });
  try {
    confirmedListener = await mod.StripeTerminal.addListener(
      mod.TerminalEventsEnum.ConfirmedPaymentIntent,
      () => resolveConfirmed(),
    );
  } catch {
    // The native confirmation promise remains the primary completion signal.
  }
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Stripe Terminal confirmation timed out.")), 15_000);
  });

  try {
    // The plugin documents that confirmPaymentIntent() itself rejects when
    // confirmation fails. Do not race the shared TerminalEventsEnum.Failed
    // event here: it is also emitted for collection failures and can replace
    // Stripe's real decline/error payload with the plugin's generic message.
    await Promise.race([mod.StripeTerminal.confirmPaymentIntent(), confirmedEvent, timeout]);
    return;
  } catch (error) {
    const status = await reconcilePaymentIntent(reference);
    if (status?.status === "succeeded" || status?.status === "requires_capture") return;
    if (status?.last_payment_error) throw new Error(status.last_payment_error);
    throw error;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    await confirmedListener?.remove().catch(() => undefined);
  }
}

async function createPaymentIntent(
  amountCents: number,
  currency: string,
  description?: string,
  idempotencyId?: string,
  checkout?: TerminalCheckout,
) {
  const startedAt = Date.now();
  const request = callApi<{ id: string; client_secret: string; status?: string }>(
    "/api/public/pos/stripe-terminal/payment-intent",
    { amount: amountCents, currency, description, idempotencyId, checkout },
  );

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => {
      reject(
        new Error("The payment service took too long to respond."),
      );
    }, 20_000);
  });

  const result = await Promise.race([request, timeout]);
  if (!result.client_secret) {
    throw new Error("The payment could not be prepared. Please try again.");
  }
  return result;
}

async function loadModule(): Promise<StripeModule> {
  if (!isNativeMode()) throw new Error("Stripe Terminal is available in the SEZA Android POS app.");
  const runtime = stripeRuntime();
  runtime.modulePromise ??= import("@capacitor-community/stripe-terminal");
  return runtime.modulePromise;
}

function driverForTerminal(terminal: StripeTerminalRecord, preferred?: TerminalDriverId) {
  if (preferred && preferred !== "none") return preferred;
  const configured = String(terminal.config?.reader_type || "");
  if (configured === "stripe") return "stripe-m2" as TerminalDriverId;
  return configured as TerminalDriverId;
}

async function activeConfiguration(preferred?: TerminalDriverId): Promise<TerminalConfiguration> {
  beginStripeTerminalDiagnostic("STRIPE_INITIALIZE", { reader_discovered: false });
  let context: StripeTerminalContext;
  try {
    context = await getStripeTerminalContext();
  } catch (error) {
    throw terminalConnectionError(error, "STRIPE_INITIALIZE");
  }

  const setupState = {
    merchant_ready: Boolean(context.ready),
    terminal_location_ready: Boolean(context.terminalLocationReady && context.locationId),
  };
  markStripeTerminalDiagnostic("STRIPE_INITIALIZE", setupState);
  if (!context.ready || !context.locationId) {
    throw terminalConnectionError(
      new Error("Stripe merchant or Terminal location setup is not ready."),
      "STRIPE_INITIALIZE",
      setupState,
    );
  }
  const terminal = context.terminals.find((item) => item.status === "active");
  if (!terminal) {
    throw terminalConnectionError(
      new Error("No active Stripe reader is configured for this merchant."),
      "STRIPE_INITIALIZE",
      setupState,
    );
  }
  const driver = driverForTerminal(terminal, preferred);
  if (!driver || driver === "none") {
    throw terminalConnectionError(
      new Error("The active Stripe reader type is not configured."),
      "STRIPE_INITIALIZE",
      setupState,
    );
  }
  const connectionMethod =
    getStripeReaderConnectionMethod(terminal.id) ??
    (String(terminal.config?.connection_method || "bluetooth").toLowerCase() === "bluetooth"
      ? "bluetooth"
      : "usb");
  markStripeTerminalDiagnostic("STRIPE_INITIALIZE", {
    ...setupState,
    transport: connectionMethod === "usb" ? "USB" : "Bluetooth",
    reader_serial: terminal.serial,
  });
  return {
    terminalId: terminal.id,
    driver,
    locationId: context.locationId,
    // IMPORTANT: @capacitor-community/stripe-terminal uses isTest to enable
    // simulated readers. A Stripe sandbox account can still use a physical M2
    // with a physical Stripe test card, so do not turn simulator mode on just
    // because the backend environment is sandbox.
    testMode: driver === "stripe-simulated",
    connectionMethod,
    serial: terminal.serial,
  };
}

function connectionType(
  mod: StripeModule,
  driver: TerminalDriverId,
  connectionMethod: "usb" | "bluetooth",
) {
  if (driver === "stripe-simulated") return mod.TerminalConnectTypes.Simulated;
  if (driver === "stripe-wisepos") return mod.TerminalConnectTypes.Internet;
  if (driver === "stripe-m2") {
    return connectionMethod === "usb" ? mod.TerminalConnectTypes.Usb : mod.TerminalConnectTypes.Bluetooth;
  }
  if (driver === "stripe-wisepad3") return mod.TerminalConnectTypes.Bluetooth;
  return mod.TerminalConnectTypes.TapToPay;
}


function readerList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.readers)) return record.readers;
  if (Array.isArray(record.value)) return record.value;
  return [];
}

function terminalConnectionError(
  error: unknown,
  stage: StripeTerminalDiagnosticStage,
  patch: Parameters<typeof failStripeTerminalDiagnostic>[2] = {},
): Error {
  failStripeTerminalDiagnostic(stage, error, patch);
  if (import.meta.env.DEV && typeof console !== "undefined") {
    console.error(`[SEZA Terminal] ${stage}`, error);
  }
  return new Error(CARD_READER_CONNECTION_ERROR);
}

function terminalDiagnosticContext(configuration: TerminalConfiguration) {
  return {
    transport: configuration.connectionMethod === "usb" ? ("USB" as const) : ("Bluetooth" as const),
    reader_serial: configuration.serial ?? null,
  };
}

async function discoverReaderList(
  mod: StripeModule,
  configuration: TerminalConfiguration,
): Promise<{ readers: any[]; stop: () => Promise<void> }> {
  let listener: { remove: () => Promise<void> } | null = null;
  let resolveEventReaders: ((readers: any[]) => void) | null = null;
  let settled = false;
  const diagnosticStage: StripeTerminalDiagnosticStage =
    configuration.connectionMethod === "usb" ? "DISCOVER_USB" : "CONNECT_READER_NATIVE";
  const diagnosticContext = terminalDiagnosticContext(configuration);
  if (configuration.connectionMethod === "usb") {
    markStripeTerminalDiagnostic("DISCOVER_USB", {
      ...diagnosticContext,
      reader_discovered: false,
    });
  }

  const eventReadersPromise = new Promise<any[]>((resolve) => {
    resolveEventReaders = (readers) => {
      if (settled) return;
      resolve(readers);
    };
  });

  const filterReaders = (value: unknown) => {
    let readers = readerList(value);

    if (configuration.driver !== "stripe-simulated") {
      readers = readers.filter((reader) => {
        const identity = `${String(reader?.label || "")} ${String(reader?.serialNumber || "")} ${String(
          reader?.deviceType || "",
        )}`;
        return !/simulator/i.test(identity);
      });
    }

    if (configuration.driver === "stripe-m2") {
      const m2Readers = readers.filter((reader) => {
        const deviceType = String(reader?.deviceType || "").toLowerCase();
        return !deviceType || deviceType === "stripem2" || deviceType.includes("m2");
      });
      if (m2Readers.length) readers = m2Readers;
    }

    if (readers.length) {
      markStripeTerminalDiagnostic(diagnosticStage, {
        ...diagnosticContext,
        reader_discovered: true,
        reader_serial: String(readers[0]?.serialNumber || configuration.serial || "") || null,
      });
    }
    return readers;
  };

  try {
    listener = await mod.StripeTerminal.addListener(
      mod.TerminalEventsEnum.DiscoveredReaders,
      (event: unknown) => {
        const next = filterReaders(event);
        if (next.length) resolveEventReaders?.(next);
      },
    );
  } catch {
    listener = null;
  }

  const nativeDiscoveryPromise = mod.StripeTerminal
    .discoverReaders({
      type: connectionType(mod, configuration.driver, configuration.connectionMethod),
      locationId: configuration.locationId,
    })
    .then((result) => {
      const readers = filterReaders(result);
      if (readers.length) return readers;
      return new Promise<any[]>(() => undefined);
    })
    .catch((error) => {
      throw terminalConnectionError(error, diagnosticStage, diagnosticContext);
    });

  const timeoutMs = configuration.connectionMethod === "usb" ? 10_000 : 20_000;
  const timeoutPromise = new Promise<any[]>((resolve) => {
    window.setTimeout(() => resolve([]), timeoutMs);
  });

  const stop = async () => {
    settled = true;
    await Promise.race([
      mod.StripeTerminal.cancelDiscoverReaders().catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1_200)),
    ]);
    if (listener) await listener.remove().catch(() => undefined);
  };

  try {
    const readers = await Promise.race([
      nativeDiscoveryPromise,
      eventReadersPromise,
      timeoutPromise,
    ]);
    return { readers, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function installConnectionTokenListener(mod: StripeModule): Promise<void> {
  const runtime = stripeRuntime();
  if (!runtime.tokenListenerPromise) {
    runtime.tokenListenerPromise = mod.StripeTerminal
      .addListener(mod.TerminalEventsEnum.RequestedConnectionToken, () => {
        markStripeTerminalDiagnostic("CONNECTION_TOKEN", {
          connection_token_requested: true,
          connection_token_delivered: false,
        });
        runtime.tokenDeliveryQueue = runtime.tokenDeliveryQueue
          .catch(() => undefined)
          .then(async () => {
            const token = await fetchConnectionToken();
            await mod.StripeTerminal.setConnectionToken({ token });
            markStripeTerminalDiagnostic("CONNECTION_TOKEN", {
              connection_token_requested: true,
              connection_token_delivered: true,
            });
          })
          .catch((error) => {
            failStripeTerminalDiagnostic("CONNECTION_TOKEN", error, {
              connection_token_requested: true,
              connection_token_delivered: false,
            });
            if (import.meta.env.DEV) console.error("[SEZA Terminal] connection token delivery failed", error);
          });
      })
      .then(() => undefined)
      .catch((error) => {
        runtime.tokenListenerPromise = null;
        throw error;
      });
  }
  await runtime.tokenListenerPromise;
}

async function probeNativeReader(mod: StripeModule): Promise<any | null> {
  try {
    const result = await mod.StripeTerminal.getConnectedReader();
    // getConnectedReader() can only succeed after the native Terminal singleton
    // has been initialized. This is also true when JS reloaded and forgot state.
    stripeRuntime().nativeInitialized = true;
    return result?.reader ?? null;
  } catch {
    return null;
  }
}

async function initialize(testMode: boolean) {
  let mod: StripeModule;
  try {
    mod = await loadModule();
    markStripeTerminalDiagnostic("STRIPE_INITIALIZE", { stripe_plugin_linked: true });
  } catch (error) {
    throw terminalConnectionError(error, "STRIPE_INITIALIZE", { stripe_plugin_linked: false });
  }
  const runtime = stripeRuntime();

  // The plugin's native TokenProvider emits RequestedConnectionToken back to JS.
  // The listener MUST exist before the first native initialize().
  try {
    await installConnectionTokenListener(mod);
  } catch (error) {
    throw terminalConnectionError(error, "STRIPE_INITIALIZE", { stripe_plugin_linked: true });
  }

  if (runtime.nativeInitialized) {
    if (runtime.initializedMode !== null && runtime.initializedMode !== testMode) {
      throw terminalConnectionError(
        new Error("Stripe Terminal was initialized in a different reader mode."),
        "STRIPE_INITIALIZE",
        { stripe_plugin_linked: true },
      );
    }
    return mod;
  }

  if (!runtime.initializePromise) {
    runtime.initializePromise = (async () => {
      // Critical: a WebView/JS reload does not necessarily destroy Stripe's
      // Android Terminal singleton. Calling plugin.initialize() a second time
      // replaces the plugin TokenProvider field while Stripe still owns the old
      // provider. Then setConnectionToken() is sent to the wrong provider and
      // Android logs: "Stripe Terminal do not pending fetchConnectionToken".
      // Probe first and preserve the existing native provider when it exists.
      await probeNativeReader(mod);
      if (stripeRuntime().nativeInitialized) {
        runtime.initializedMode = testMode;
        return mod;
      }

      try {
        await mod.StripeTerminal.initialize({ isTest: testMode });
      } catch (error) {
        throw terminalConnectionError(error, "STRIPE_INITIALIZE", { stripe_plugin_linked: true });
      }
      runtime.nativeInitialized = true;
      runtime.initializedMode = testMode;
      return mod;
    })().finally(() => {
      runtime.initializePromise = null;
    });
  }

  return runtime.initializePromise;
}

async function ensureStripeTerminalPermissions(configuration: TerminalConfiguration) {
  if (!isNativeMode() || configuration.driver === "stripe-simulated" || configuration.driver === "stripe-wisepos") return;
  const diagnosticContext = terminalDiagnosticContext(configuration);
  markStripeTerminalDiagnostic("ANDROID_PERMISSION", diagnosticContext);
  const { deviceControl } = await import("@/lib/device-control");
  let permission;
  try {
    permission = await deviceControl.requestTerminalPermissions(configuration.connectionMethod);
  } catch (error) {
    throw terminalConnectionError(error, "ANDROID_PERMISSION", diagnosticContext);
  }
  if (permission.granted && permission.locationGranted) return;

  throw terminalConnectionError(
    new Error("Android terminal permission was not granted."),
    "ANDROID_PERMISSION",
    {
      ...diagnosticContext,
      reader_discovered:
        configuration.connectionMethod === "usb" && typeof permission.usbDeviceFound === "boolean"
          ? permission.usbDeviceFound
          : null,
    },
  );
}

async function ensureReaderInternal(configuration: TerminalConfiguration, onStatus?: (message: string) => void) {
  const diagnosticContext = terminalDiagnosticContext(configuration);
  const mod = await initialize(configuration.testMode);
  const current = await mod.StripeTerminal.getConnectedReader().catch(() => ({ reader: null }));
  if (current.reader) {
    const serial = current.reader.serialNumber || configuration.serial || configuration.driver;
    stripeRuntime().connected = {
      terminalId: configuration.terminalId,
      driver: configuration.driver,
      serial,
    };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("pos.terminal.connectedAt", new Date().toISOString());
      localStorage.removeItem("pos.terminal.lastError");
      localStorage.removeItem("pos.terminal.rawError");
    }
    succeedStripeTerminalDiagnostic({
      ...diagnosticContext,
      reader_discovered: true,
      reader_serial: String(serial),
      stripe_plugin_linked: true,
    });
    return { mod, reader: current.reader };
  }

  await ensureStripeTerminalPermissions(configuration);

  onStatus?.(
    `Discovering Stripe reader over ${configuration.connectionMethod === "usb" ? "USB" : "Bluetooth"}…`,
  );
  const discovery = await discoverReaderList(mod, configuration);
  const readers = discovery.readers;
  const reader = configuration.serial
    ? readers.find((item) => item?.serialNumber === configuration.serial) ?? readers[0]
    : readers[0];

  if (!reader) {
    await discovery.stop();
    const stage: StripeTerminalDiagnosticStage =
      configuration.connectionMethod === "usb" ? "DISCOVER_USB_EMPTY" : "CONNECT_READER_NATIVE";
    throw terminalConnectionError(
      new Error(
        configuration.connectionMethod === "usb"
          ? "No Stripe Reader M2 was discovered over USB."
          : "No Stripe reader was discovered over Bluetooth.",
      ),
      stage,
      { ...diagnosticContext, reader_discovered: false },
    );
  }

  const readerSerial = String(reader.serialNumber || configuration.serial || "") || null;
  markStripeTerminalDiagnostic("CONNECT_READER_NATIVE", {
    ...diagnosticContext,
    reader_discovered: true,
    reader_serial: readerSerial,
  });
  onStatus?.(`Connecting ${reader.label || reader.serialNumber}…`);
  try {
    // Keep Stripe discovery alive until connectReader receives the selected
    // Reader object. Cancelling discovery first can invalidate a mobile reader
    // connection attempt on some Android/USB stacks.
    const connectionOptions = {
      reader,
      locationId: configuration.locationId,
      autoReconnectOnUnexpectedDisconnect: true,
    };
    await mod.StripeTerminal.connectReader(connectionOptions);
  } catch (error) {
    throw terminalConnectionError(error, "CONNECT_READER_NATIVE", {
      ...diagnosticContext,
      reader_discovered: true,
      reader_serial: readerSerial,
    });
  } finally {
    await discovery.stop();
  }

  markStripeTerminalDiagnostic("READER_API_SAVE", {
    ...diagnosticContext,
    reader_discovered: true,
    reader_serial: readerSerial,
  });
  try {
    await updateStripeTerminal("connected", configuration.terminalId, { serial: reader.serialNumber });
  } catch (error) {
    await mod.StripeTerminal.disconnectReader().catch(() => undefined);
    stripeRuntime().connected = null;
    throw terminalConnectionError(error, "READER_API_SAVE", {
      ...diagnosticContext,
      reader_discovered: true,
      reader_serial: readerSerial,
    });
  }

  stripeRuntime().connected = {
    terminalId: configuration.terminalId,
    driver: configuration.driver,
    serial: reader.serialNumber,
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("pos.terminal.connectedAt", new Date().toISOString());
    localStorage.removeItem("pos.terminal.lastError");
    localStorage.removeItem("pos.terminal.rawError");
  }
  succeedStripeTerminalDiagnostic({
    ...diagnosticContext,
    reader_discovered: true,
    reader_serial: readerSerial,
    stripe_plugin_linked: true,
  });
  return { mod, reader };
}

// Manual pairing, automatic reconnect, and payment checkout can all ask for the
// same M2 connection. Stripe Terminal only allows one discovery/connect flow at
// a time, so share one in-flight promise instead of starting overlapping native
// discovery sessions that can cancel each other or destabilize the Android SDK.
async function ensureReader(configuration: TerminalConfiguration, onStatus?: (message: string) => void) {
  const runtime = stripeRuntime();
  if (runtime.readerConnectPromise) return runtime.readerConnectPromise;

  runtime.readerConnectPromise = ensureReaderInternal(configuration, onStatus).finally(() => {
    runtime.readerConnectPromise = null;
  });
  return runtime.readerConnectPromise;
}

export async function restoreStripeTerminalSelection() {
  try {
    const context = await getStripeTerminalContext();
    const active = context.terminals.find((item) => item.status === "active");
    if (!active) return false;
    const driver = driverForTerminal(active);
    if (!driver || driver === "none") return false;
    const [{ setActiveTerminal }, { setActivePaymentProvider }] = await Promise.all([
      import("./index"),
      import("@/lib/pos/payment-terminal"),
    ]);
    setActiveTerminal(driver);
    setActivePaymentProvider("stripe-terminal");
    return true;
  } catch {
    return false;
  }
}

export async function pluginAvailable() {
  try {
    await loadModule();
    return true;
  } catch {
    return false;
  }
}

export async function isTapToPaySupported() {
  if (!isNativeMode()) return false;
  try {
    const mod = await loadModule();
    const value = (mod.StripeTerminal as any).isTapToPaySupported;
    if (typeof value !== "function") return null;
    const result = await value.call(mod.StripeTerminal);
    return Boolean(result?.supported ?? result?.isSupported ?? result);
  } catch {
    return false;
  }
}

export async function discoverReaders(driver: TerminalDriverId) {
  const configuration = await activeConfiguration(driver);
  await ensureStripeTerminalPermissions(configuration);
  const mod = await initialize(configuration.testMode);
  const discovery = await discoverReaderList(mod, configuration);
  try {
    return discovery.readers.map((reader) => ({
      id: String(reader?.serialNumber || reader?.id || "reader"),
      label: String(reader?.label || reader?.serialNumber || "Stripe reader"),
    }));
  } finally {
    await discovery.stop();
  }
}

export async function connectReader(driver: TerminalDriverId, onStatus?: (message: string) => void) {
  try {
    const configuration = await activeConfiguration(driver);
    const { reader } = await ensureReader(configuration, onStatus);
    return { terminalId: configuration.terminalId, serialNumber: reader.serialNumber, label: reader.label || reader.serialNumber };
  } catch {
    const safe = new Error(CARD_READER_CONNECTION_ERROR);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("pos.terminal.lastError", safe.message);
      localStorage.removeItem("pos.terminal.rawError");
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:device-config-changed"));
    throw safe;
  }
}

export function connectedReader() {
  return stripeRuntime().connected?.serial || stripeRuntime().connected?.driver || null;
}

export async function isReady(_driver: TerminalDriverId) {
  if (!isNativeMode()) return false;
  try {
    const mod = await loadModule();
    const reader = await probeNativeReader(mod);
    if (!reader) return false;

    const runtime = stripeRuntime();
    if (!runtime.connected) {
      runtime.connected = {
        terminalId: "",
        driver: _driver,
        serial: String(reader.serialNumber || reader.label || "Stripe Reader M2"),
      };
    }
    return true;
  } catch {
    return false;
  }
}

class StripePaymentCancelledError extends Error {
  constructor() {
    super("Payment cancelled");
    this.name = "StripePaymentCancelledError";
  }
}

async function cancelNativeCollection() {
  try {
    const mod = await loadModule();
    await mod.StripeTerminal.cancelCollectPaymentMethod();
  } catch {
    // Stripe's Capacitor wrapper resolves when no collection is active and can
    // also reject if the operation already finished. The attempt-level cancel
    // flag below is the source of truth for SEZA in both cases.
  }
}

export async function charge(
  driver: TerminalDriverId,
  input: { amountCents: number; currency: string; description?: string; idempotencyId?: string; checkout?: TerminalCheckout },
  onStatus?: (message: string) => void,
  signal?: AbortSignal,
): Promise<{ ok: true; ref: string } | { ok: false; error: string; cancelled?: boolean }> {
  const runtime = stripeRuntime();
  if (runtime.paymentInFlight) {
    // If the prior dialog was just closed/cancelled, its native M2 operation
    // may need a brief moment to unwind. Queue the next sale behind that
    // cancellation instead of surfacing a false "payment in progress" error.
    if (
      runtime.cancelRequestedFor === runtime.paymentAttemptId &&
      runtime.paymentSettledPromise
    ) {
      await runtime.paymentSettledPromise;
    }
  }

  // A genuinely active (non-cancelled) payment still blocks a second charge.
  // Re-check after the await above in case another caller acquired the slot.
  if (runtime.paymentInFlight) {
    return {
      ok: false,
      error: "A card payment is already in progress. Wait for it to finish or cancel it.",
    };
  }

  const attemptId = runtime.paymentAttemptId + 1;
  runtime.paymentAttemptId = attemptId;
  runtime.paymentInFlight = true;
  runtime.cancelRequestedFor = null;
  runtime.paymentStage = "preparing";
  runtime.paymentSettledPromise = new Promise<void>((resolve) => {
    runtime.resolvePaymentSettled = resolve;
  });

  const requestCancel = () => {
    if (!runtime.paymentInFlight || runtime.paymentAttemptId !== attemptId) return;
    // Once card collection has completed, confirmPaymentIntent can already be
    // committing money. Do not turn a late UI close into a fake cancellation.
    if (runtime.paymentStage === "confirming") return;
    runtime.cancelRequestedFor = attemptId;
    void cancelNativeCollection();
  };

  const throwIfCancelled = () => {
    if (runtime.cancelRequestedFor === attemptId || signal?.aborted) {
      throw new StripePaymentCancelledError();
    }
  };

  if (signal?.aborted) requestCancel();
  signal?.addEventListener("abort", requestCancel, { once: true });

  let paymentIntentId = "";
  try {
    if (input.amountCents < 1) {
      return { ok: false, error: "Card payments must be at least $0.01." };
    }

    throwIfCancelled();
    const configuration = await activeConfiguration(driver);
    throwIfCancelled();
    const { mod } = await ensureReader(configuration, onStatus);
    throwIfCancelled();
    onStatus?.("Creating secure card-present payment…");
    const intent = await createPaymentIntent(input.amountCents, input.currency, input.description, input.idempotencyId,input.checkout);
    paymentIntentId = intent.id;
    if (intent.status === "succeeded") {
      onStatus?.("Payment approved");
      void recordPaymentResult(intent.id,"completed","Recovered previously approved payment");
      return {ok:true,ref:intent.id};
    }
    if (intent.status && !["requires_payment_method","requires_confirmation"].includes(intent.status))
      throw new Error("Payment is still being reconciled. Do not charge again.");
    throwIfCancelled();
    onStatus?.("Ask the customer to tap, insert, or swipe…");
    runtime.paymentStage = "collecting";
    await mod.StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
    throwIfCancelled();
    runtime.paymentStage = "confirming";
    onStatus?.("Processing payment…");
    await confirmCollectedPayment(mod, intent.id);

    // Stripe Terminal has already confirmed the card-present PaymentIntent at
    // this point. Do not add another blocking server status-poll loop to every
    // successful tap/insert/swipe; that loop could add several seconds after
    // the reader had already approved the payment.
    onStatus?.("Payment approved");

    // Audit persistence is important, but it is not part of card authorization.
    // Save it in the background so the cashier can complete the sale immediately
    // after Stripe's native confirmation. The error fallback inside
    // confirmCollectedPayment() still reconciles with Stripe when confirmation
    // is ambiguous or times out.
    void recordPaymentResult(intent.id, "completed", "Stripe Terminal payment approved");

    return { ok: true, ref: intent.id };
  } catch (error) {
    const cancelled =
      error instanceof StripePaymentCancelledError || runtime.cancelRequestedFor === attemptId;
    if (cancelled) {
      if (paymentIntentId) {
        void recordPaymentResult(paymentIntentId, "failed", "Payment cancelled");
      }
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("pos.terminal.lastError");
      }
      return { ok: false, error: "Payment cancelled", cancelled: true };
    }

    const rawMessage = error instanceof Error ? error.message : "Card payment failed.";
    const message = rawMessage.includes("most recently collected")
      ? "The reader lost the active payment session. Cancel the payment and try the card once more."
      : rawMessage.includes("timed out")
        ? "The card was read, but Stripe did not finish the payment in time. Check the payment status before retrying."
        : userFacingError(error, "Card payment failed. Please try again.");
    if (paymentIntentId) await recordPaymentResult(paymentIntentId, "failed", message);
    if (typeof localStorage !== "undefined") localStorage.setItem("pos.terminal.lastError", message);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:device-config-changed"));
    return { ok: false, error: message };
  } finally {
    signal?.removeEventListener("abort", requestCancel);
    if (runtime.paymentAttemptId === attemptId) {
      runtime.paymentInFlight = false;
      runtime.cancelRequestedFor = null;
      runtime.paymentStage = "idle";
      const resolveSettled = runtime.resolvePaymentSettled;
      runtime.resolvePaymentSettled = null;
      runtime.paymentSettledPromise = null;
      resolveSettled?.();
    }
  }
}

export async function cancelActivePayment() {
  const runtime = stripeRuntime();
  if (!runtime.paymentInFlight) return;

  const attemptId = runtime.paymentAttemptId;
  const settled = runtime.paymentSettledPromise;

  // A PaymentIntent is already being confirmed at this stage. Waiting for its
  // real result is safer than reporting "cancelled" while Stripe may approve
  // it in the background.
  if (runtime.paymentStage === "confirming") {
    await settled;
    return;
  }

  runtime.cancelRequestedFor = attemptId;
  await cancelNativeCollection();

  // Do not release SEZA's payment lock early. A second collect call while the
  // M2 still owns the first native operation is exactly what produces
  // "payment in progress" / unexpected-operation failures.
  await settled;
}

export async function disconnect() {
  const runtime = stripeRuntime();
  const terminalId = runtime.connected?.terminalId;

  // Stripe's native disconnectReader() calls Terminal.getInstance() and will
  // crash the Android process if Terminal.initTerminal() has not run yet.
  // A fresh USB connection flow may call disconnect() defensively before the
  // first initialize(), so make that pre-init disconnect a no-op.
  if (runtime.nativeInitialized || runtime.initializedMode !== null) {
    try {
      const mod = await loadModule();
      await mod.StripeTerminal.disconnectReader();
    } catch {
      // Treat an already-disconnected reader as successfully disconnected.
    }
  }

  runtime.connected = null;
  if (terminalId) await updateStripeTerminal("disconnected", terminalId).catch(() => undefined);
}
