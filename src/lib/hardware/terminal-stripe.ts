import { createTerminalContextReads } from "./terminal-context";
import { READER_CONNECTION_MESSAGE, recordReaderDiagnostic, readerErrorCode, getReaderDiagnostic, clearReaderDiagnostic, beginReaderAttempt, readerFailure, readerMessage, type ReaderErrorCode } from "./reader-diagnostics";
import type { TerminalDriverId } from "./index";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { readMeta } from "@/lib/offline/db";
import { userFacingError } from "@/lib/errors/user-facing";
import type { TerminalCheckout } from "@/lib/pos/terminal-checkout";

const REMOTE_API = "https://sezapos.com";

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
  epoch: number;
  storeId: string;
  terminalId: string;
  driver: TerminalDriverId;
  locationId: string;
  testMode: boolean;
  connectionMethod: "usb" | "bluetooth";
  serial?: string | null;
};

type StripeTerminalRuntimeState = {
  epoch: number;
  resetPromise: Promise<void> | null;
  resetFailed: boolean;
  storeId: string | null;
  listenersPromise: Promise<void> | null;
  sdkReconnecting: boolean;
  configuration: TerminalConfiguration | null;
  discoveryPromise: Promise<any[]> | null;
  readerStatusQueue: Promise<unknown>;
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
  connectRequestPromise: Promise<{ terminalId: string; serialNumber: string; label: string }> | null;
  tokenRequestIds: Set<string>;
  onReaderStatus: ((message: string) => void) | null;
  readerConnectPromise: Promise<{ mod: StripeModule; reader: any }> | null;
  paymentInFlight: boolean;
  paymentAttemptId: number;
  cancelRequestedFor: number | null;
  paymentStage: "idle" | "preparing" | "collecting" | "confirming";
  paymentSettledPromise: Promise<void> | null;
  resolvePaymentSettled: (() => void) | null;
};

const contextReads = createTerminalContextReads<StripeTerminalContext>();

const STRIPE_RUNTIME_KEY = "__sezaStripeTerminalRuntime";

function stripeRuntime(): StripeTerminalRuntimeState {
  const root = globalThis as typeof globalThis & {
    [STRIPE_RUNTIME_KEY]?: StripeTerminalRuntimeState;
  };

  root[STRIPE_RUNTIME_KEY] ??= {
    epoch: 0, resetPromise: null, resetFailed: false, storeId: null, listenersPromise: null, sdkReconnecting: false, configuration: null, discoveryPromise: null, readerStatusQueue: Promise.resolve(),
    modulePromise: null,
    nativeInitialized: false,
    initializedMode: null,
    initializePromise: null,
    tokenListenerPromise: null,
    tokenDeliveryQueue: Promise.resolve(),
    connected: null,
    connectRequestPromise: null, tokenRequestIds: new Set(), onReaderStatus: null,
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
  runtime.connectRequestPromise ??= null;
  runtime.tokenRequestIds ??= new Set();
  runtime.onReaderStatus ??= null;
  runtime.epoch ??= 0;
  runtime.resetPromise ??= null;
  runtime.resetFailed ??= false;
  runtime.storeId ??= null;
  runtime.listenersPromise ??= null;
  runtime.sdkReconnecting ??= false;
  runtime.configuration ??= null;
  runtime.discoveryPromise ??= null;
  runtime.readerStatusQueue ??= Promise.resolve();
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
export async function resetStripeTerminalForMerchantSwitch(adoptMerchant?: () => Promise<void>): Promise<void> {
  if (!isNativeMode()) { await adoptMerchant?.(); return; }
  const runtime = stripeRuntime();
  if (runtime.resetPromise) return runtime.resetPromise;
  if (runtime.paymentInFlight) throw new Error(READER_CONNECTION_MESSAGE);
  runtime.epoch += 1; // Invalidate callbacks before the first await.
  contextReads.invalidate();
  runtime.resetFailed = true; // Fail closed until native credentials are cleared.
  beginReaderAttempt();
  recordReaderDiagnostic("MERCHANT_RESET", "pending");
  const connecting = runtime.readerConnectPromise;
  runtime.resetPromise = (async () => {
    const mod = await loadModule();
    await mod.StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
    await mod.StripeTerminal.cancelReaderReconnection().catch(() => undefined);
    await runtime.tokenDeliveryQueue.catch(() => undefined);
    await connecting?.catch(() => undefined);
    await runtime.discoveryPromise?.catch(() => undefined);
    await runtime.readerStatusQueue.catch(() => undefined);
    if (await probeNativeReader(mod)) await mod.StripeTerminal.disconnectReader();
    const clear = (mod.StripeTerminal as any).clearCachedCredentials;
    if (typeof clear !== "function") throw new Error("Native credential reset unavailable");
    await clear.call(mod.StripeTerminal);
    runtime.connected = null;
    runtime.storeId = null;
    runtime.configuration = null;
    runtime.sdkReconnecting = false;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CONNECTION_METHOD_PREFIX)) localStorage.removeItem(key);
    }
    localStorage.removeItem("pos.terminal.connectedAt");
    localStorage.removeItem("pos.terminal.lastError");
    localStorage.removeItem("pos.terminal.rawError");
    localStorage.removeItem("pos.stripe.readerSelection");
    localStorage.removeItem("pos.stripe.sdkMerchant");
    const [{ setActiveTerminal }, { setActivePaymentProvider }] = await Promise.all([import("./index"), import("@/lib/pos/payment-terminal")]);
    setActiveTerminal("none"); setActivePaymentProvider(null);
    // Keep token/discovery callbacks blocked until the new pairing is stored.
    await adoptMerchant?.();
    runtime.resetFailed = false;
    recordReaderDiagnostic("MERCHANT_RESET", "ok");
  })().catch(() => {
    runtime.connected = null;
    recordReaderDiagnostic("MERCHANT_RESET", "error", { native_error_code: "RESET" });
    throw new Error(READER_CONNECTION_MESSAGE);
  }).finally(() => { runtime.resetPromise = null; });
  return runtime.resetPromise;
}
function assertReaderEpoch(epoch: number) {
  const runtime = stripeRuntime();
  if (runtime.epoch !== epoch || runtime.resetPromise || runtime.resetFailed) throw new Error(READER_CONNECTION_MESSAGE);
}
export function readerOperationBusy() {
  const r = stripeRuntime();
  return Boolean(r.resetPromise || r.resetFailed || r.connectRequestPromise || r.readerConnectPromise || r.discoveryPromise || r.paymentInFlight || r.sdkReconnecting);
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
  const epoch = stripeRuntime().epoch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  let request = fetch;
  let payload: Record<string, unknown> = body;

  if (isNativeMode()) {
    const auth = await nativeAuth();
    if (!auth) throw readerFailure("SESSION");
    request = (await import("../../../capacitor-shell/lib/nativeHttp")).nativeFetch;
    payload = { ...body, nativeAuth: auth };
    // A matching authenticated owner/manager session can outlive a PIN grant.
    // Server validation still requires this exact actor, store and paired device.
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (data.session?.user.id === auth.caller_id) {
      headers.authorization = `Bearer ${data.session.access_token}`;
    }
  } else {
    headers.authorization = `Bearer ${await bearer()}`;
  }

  if (stripeRuntime().epoch !== epoch) throw new Error(READER_CONNECTION_MESSAGE);
  const response = await request(`${apiBase()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = (result as any)?.code;
    if (path.endsWith("/context") && response.status === 429) {
      const retry = Number(response.headers.get("retry-after") || (result as any)?.retry_after_seconds || 1);
      throw Object.assign(readerFailure("CONTEXT_RATE_LIMIT"), {
        retryAfterSeconds: Number.isFinite(retry) ? Math.max(1, Math.min(300, retry)) : 1,
        httpStatus: 429, contextStep: "RATE_LIMIT",
      });
    }
    if (["TOKEN", "MERCHANT_SETUP", "LOCATION", "SAVE", "SESSION", "CONTEXT", "CONFIGURE"].includes(code)) {
      throw Object.assign(readerFailure(code), { httpStatus: response.status, contextStep: (result as any)?.context_step });
    }
    if (response.status === 401) throw readerFailure("SESSION");
    if (path.endsWith("/context")) throw readerFailure("CONTEXT");
    throw new Error(String((result as any)?.error || `SEZA payment service error ${response.status}`));
  }
  if (stripeRuntime().epoch !== epoch) throw readerFailure("RESET");
  return result as T;
}

export function recoverStripeCheckout(action: "recover" | "acknowledge" | "abandon" = "recover", checkoutId?: string) {
  return callApi<{checkouts: {checkoutId: string; status: string; sale?: any; message?: string}[]}>(
    "/api/public/pos/stripe-terminal/payment-result",{action,checkoutId});
}

export async function getStripeTerminalContext(options?: { fresh?: boolean; attempt?: boolean }): Promise<StripeTerminalContext> {
  const epoch = stripeRuntime().epoch;
  try {
    const auth = await nativeAuth();
    const actor = auth ? `${auth.store_id}:${auth.device_id}:${auth.caller_id}` : (await supabase.auth.getSession()).data.session?.user.id ?? "signed-out";
    const context = await contextReads.read(`${epoch}:${actor}`, async () => {
      const value = await readerDeadline(callApi<StripeTerminalContext>("/api/public/pos/stripe-terminal/context"), 15_000, "CONTEXT");
      if (!value || typeof value.ready !== "boolean" || !Array.isArray(value.terminals)) throw readerFailure("CONTEXT");
      return value;
    }, options?.fresh === true);
    assertReaderEpoch(epoch);
    return context;
  } catch (error) {
    if (stripeRuntime().epoch !== epoch) throw readerFailure("RESET");
    const e = error as { code?: string; retryAfterSeconds?: number; httpStatus?: number; contextStep?: string };
    const code = e?.code === "SESSION" ? "SESSION" : e?.code === "CONTEXT_RATE_LIMIT" ? "CONTEXT_RATE_LIMIT" : "CONTEXT";
    // A heartbeat read must never replace the last real connect/discovery failure.
    if (options?.attempt) recordReaderDiagnostic(code === "SESSION" ? "POS_AUTH" : "MERCHANT_CONTEXT", "error", {
      native_error_code: code, context_http_status: e.httpStatus, context_step: e.contextStep,
    });
    throw Object.assign(readerFailure(code), { retryAfterSeconds: e.retryAfterSeconds, httpStatus: e.httpStatus, contextStep: e.contextStep });
  }
}

// Isolated from heartbeat/payment context: setup checks cannot interrupt a
// working reader and never cache a token or an onboarding link.
export async function getStripeReaderSetup() {
  const { setup } = await readerDeadline(callApi<{ setup: import("./reader-setup").ReaderSetup }>(
    "/api/public/pos/stripe-terminal/context", { setup: true }), 30_000, "CONTEXT");
  if (!setup || !["connect_stripe", "verification", "bank", "review", "address", "location", "retry", "reader"].includes(setup.step)) throw readerFailure("CONTEXT");
  // A successful setup check may have recovered/saved a Terminal location.
  if (setup.step === "reader") contextReads.invalidate();
  return setup;
}

async function connectionContext(onStatus?: (message: string) => void) {
  const epoch = stripeRuntime().epoch;
  try { return await getStripeTerminalContext({ fresh: true, attempt: true }); }
  catch (error) {
    const e = error as { code?: string; retryAfterSeconds?: number };
    if (e.code !== "CONTEXT_RATE_LIMIT") throw error;
    const seconds = Math.max(1, Math.min(300, e.retryAfterSeconds ?? 1));
    onStatus?.("SEZA is waiting for the reader service. Connection will continue automatically.");
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, until - Date.now())));
      assertReaderEpoch(epoch);
    }
    // One bounded retry keeps the same Connect attempt and native continuation.
    return getStripeTerminalContext({ fresh: true, attempt: true });
  }
}

export async function saveStripeTerminal(input: {
  label: string;
  model: string;
  serial?: string;
  location?: string;
  readerType: TerminalDriverId;
  connectionMethod?: "usb" | "bluetooth";
}) {
  try {
    return await callApi<{ ok: true; terminals: StripeTerminalRecord[] }>(
      "/api/public/pos/stripe-terminal/reader", { action: "save", ...input },
    );
  } finally { contextReads.invalidate(); }
}

export async function updateStripeTerminal(
  action: "activate" | "connected" | "disconnected" | "remove" | "connection_method",
  terminalId: string,
  extra: Record<string, unknown> = {},
) {
  const runtime = stripeRuntime();
  const epoch = runtime.epoch;
  const write = () => {
    assertReaderEpoch(epoch);
    return callApi<{ ok: true; terminals: StripeTerminalRecord[] }>(
      "/api/public/pos/stripe-terminal/reader", { action, terminalId, ...extra },
    ).finally(() => contextReads.invalidate());
  };
  if (action !== "connected" && action !== "disconnected") return write();
  // Preserve native event order when a disconnect request is slow in transit.
  const result = runtime.readerStatusQueue.catch(() => undefined).then(write);
  runtime.readerStatusQueue = result;
  return result;
}

export async function refundStripeSale(input: {
  request: { id: string; sale_id: string; type: string; reason: string; notes: string | null; restock: boolean; items: Array<{ sale_item_id: string; quantity: number }> };
  approvalToken?: string;
}) {
  return callApi<{ refund: { id: string; total: number; status: string; created_at: string }; effectiveItems: Array<{ sale_item_id: string; quantity: number }> }>("/api/public/pos/stripe-terminal/refund", input);
}

function readerDeadline<T>(promise: Promise<T>, ms: number, code: ReaderErrorCode): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(readerFailure(code)), ms);
  })]).finally(() => clearTimeout(timer));
}
async function fetchConnectionToken() {
  // Request fresh credentials every time. The native watchdog is a second guard.
  const result = await readerDeadline(callApi<{ secret: string }>("/api/public/pos/stripe-terminal/connection-token"), 8_000, "TOKEN");
  if (!result.secret || typeof result.secret !== "string") throw readerFailure("TOKEN");
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

export function selectedStripeTerminal(context: StripeTerminalContext) {
  // Unexpected disconnect changes the API status to configured. Remember the
  // actual selected reader across process restarts without adopting another store.
  try {
    const saved = JSON.parse(localStorage.getItem("pos.stripe.readerSelection") || "null");
    const selected = context.terminals.find(item => item.id === saved?.id && item.store_id === saved?.store_id && ["configured", "active"].includes(item.status));
    if (selected) return selected;
  } catch { /* no saved selection */ }
  return context.terminals.find(item => item.status === "active");
}

async function ensureCurrentMerchant() {
  assertReaderEpoch(stripeRuntime().epoch);
  const auth = await nativeAuth();
  const scopedMerchant = localStorage.getItem("pos.stripe.sdkMerchant");
  let unknownNativeMerchant = false;
  if (auth && !scopedMerchant && !stripeRuntime().storeId) {
    const mod = await loadModule();
    try { await mod.StripeTerminal.getConnectedReader(); unknownNativeMerchant = true; } catch { /* a fresh native singleton has no credentials */ }
  }
  if (auth && (unknownNativeMerchant || (scopedMerchant && scopedMerchant !== auth.store_id) || (stripeRuntime().storeId && stripeRuntime().storeId !== auth.store_id))) {
    await resetStripeTerminalForMerchantSwitch();
  }
  return auth;
}

async function activeConfiguration(preferred?: TerminalDriverId, preparedContext?: StripeTerminalContext): Promise<TerminalConfiguration> {
  const auth = await ensureCurrentMerchant();
  const epoch = stripeRuntime().epoch;
  assertReaderEpoch(epoch);
  recordReaderDiagnostic("MERCHANT_CONTEXT", "pending");
  const context = preparedContext ?? await connectionContext(stripeRuntime().onReaderStatus ?? undefined);
  assertReaderEpoch(epoch);
  const merchantReady = context.connectStatus === "ready" && ["active", "enabled"].includes(context.cardPaymentsStatus ?? "");
  recordReaderDiagnostic("MERCHANT_CONTEXT", "ok", { merchant_ready: merchantReady, terminal_location_ready: Boolean(context.locationId && context.terminalLocationReady) });
  if (!merchantReady) throw readerFailure("MERCHANT_SETUP");
  if (!context.locationId || !context.terminalLocationReady) throw readerFailure("LOCATION");
  const terminal = selectedStripeTerminal(context);
  if (!terminal) throw new Error("No Stripe reader is active. Open Payment terminal and pair a reader.");
  if (stripeRuntime().storeId && stripeRuntime().storeId !== terminal.store_id) throw new Error(READER_CONNECTION_MESSAGE);
  if (auth && auth.store_id !== terminal.store_id) throw readerFailure("TOKEN");
  stripeRuntime().storeId = terminal.store_id;
  localStorage.setItem("pos.stripe.sdkMerchant", terminal.store_id);
  const driver = driverForTerminal(terminal, preferred);
  if (!driver || driver === "none") throw new Error("The active Stripe reader type is not configured.");
  return {
    epoch,
    storeId: terminal.store_id,
    terminalId: terminal.id,
    driver,
    locationId: context.locationId,
    // IMPORTANT: @capacitor-community/stripe-terminal uses isTest to enable
    // simulated readers. A Stripe sandbox account can still use a physical M2
    // with a physical Stripe test card, so do not turn simulator mode on just
    // because the backend environment is sandbox.
    testMode: driver === "stripe-simulated",
    connectionMethod:
      getStripeReaderConnectionMethod(terminal.id) ??
      (String(terminal.config?.connection_method || "usb").toLowerCase() === "bluetooth"
        ? "bluetooth"
        : "usb"),
    serial: terminal.serial || savedReaderSerial(terminal),
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

function terminalError(error: unknown, _stage: string): Error {
  const d = getReaderDiagnostic();
  let code = d?.status === "error" && d.native_error_code ? d.native_error_code : readerErrorCode(error);
  if (d?.stage === "READER_API_SAVE") code = "SAVE";
  if (d?.connection_token_requested === true && d.connection_token_delivered === false && code !== "RESET") code = "TOKEN";
  if (d?.status !== "error") recordReaderDiagnostic(d?.stage ?? "STRIPE_INITIALIZE", "error", { native_error_code: code });
  return readerFailure(code);
}
function savedReaderSerial(terminal: StripeTerminalRecord): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem("pos.stripe.readerSelection") || "null");
    return saved?.id === terminal.id && saved?.store_id === terminal.store_id && typeof saved.serial === "string" ? saved.serial : null;
  } catch { return null; }
}

async function discoverReaderList(
  mod: StripeModule,
  configuration: TerminalConfiguration,
): Promise<{ readers: any[]; stop: () => Promise<void> }> {
  let listener: { remove: () => Promise<void> } | null = null;
  let resolveEventReaders: ((readers: any[]) => void) | null = null;
  let settled = false;
  let timeout: number | undefined;

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
      readers = m2Readers;
    }

    return readers;
  };

  try {
    listener = await mod.StripeTerminal.addListener(
      mod.TerminalEventsEnum.DiscoveredReaders,
      (event: unknown) => {
        const next = filterReaders(event);
        if (stripeRuntime().epoch !== configuration.epoch) return;
        const matching = configuration.serial ? next.filter(reader => reader.serialNumber === configuration.serial) : next;
        if (matching.length) resolveEventReaders?.(matching);
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
      const next = filterReaders(result);
      const readers = configuration.serial ? next.filter(reader => reader.serialNumber === configuration.serial) : next;
      if (readers.length) return readers;
      return new Promise<any[]>(() => undefined);
    })
    .catch((error) => {
      throw terminalError(error, "DISCOVER_READERS");
    });

  const timeoutMs = configuration.connectionMethod === "usb" ? 10_000 : 20_000;
  let watch: ReturnType<typeof setInterval> | undefined;
  const tokenFailure = new Promise<never>((_, reject) => {
    watch = setInterval(() => {
      const d = getReaderDiagnostic();
      if (stripeRuntime().epoch !== configuration.epoch) reject(readerFailure("RESET"));
      else if (d?.native_error_code === "TOKEN" && d.status === "error") reject(readerFailure("TOKEN"));
    }, 100);
  });
  const timeoutPromise = new Promise<any[]>((resolve) => {
    timeout = window.setTimeout(() => resolve([]), timeoutMs);
  });

  const stop = async () => {
    settled = true;
    clearTimeout(timeout);
    clearInterval(watch);
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
      tokenFailure,
    ]);
    clearTimeout(timeout);
    clearInterval(watch);
    return { readers, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function installConnectionTokenListener(mod: StripeModule): Promise<void> {
  const runtime = stripeRuntime();
  if (!runtime.tokenListenerPromise) {
    runtime.tokenListenerPromise = (mod.StripeTerminal.addListener as any)(mod.TerminalEventsEnum.RequestedConnectionToken, (event: any) => {
        const requestId = typeof event?.requestId === "string" ? event.requestId : undefined;
        if (requestId && runtime.tokenRequestIds.has(requestId)) return;
        if (requestId) { runtime.tokenRequestIds.add(requestId); if (runtime.tokenRequestIds.size > 100) runtime.tokenRequestIds.delete(runtime.tokenRequestIds.values().next().value!); }
        const epoch = runtime.epoch;
        runtime.tokenDeliveryQueue = runtime.tokenDeliveryQueue.catch(() => undefined).then(async () => {
          let deliveryAttempted = false;
          try {
            assertReaderEpoch(epoch);
            recordReaderDiagnostic("CONNECTION_TOKEN_REQUEST", "pending", { connection_token_requested: true, connection_token_delivered: false });
            const token = await fetchConnectionToken();
            assertReaderEpoch(epoch);
            deliveryAttempted = true;
            await (mod.StripeTerminal.setConnectionToken as any)({ token, requestId });
            assertReaderEpoch(epoch);
            recordReaderDiagnostic("CONNECTION_TOKEN_DELIVERED", "ok", { connection_token_delivered: true });
          } catch {
            // Native removes only this request ID; never drain a newer callback.
            if (!deliveryAttempted) await (mod.StripeTerminal.setConnectionToken as any)({ token: "", requestId }).catch(() => undefined);
            if (runtime.epoch === epoch && !runtime.resetPromise) recordReaderDiagnostic("CONNECTION_TOKEN_REQUEST", "error", { native_error_code: "TOKEN", connection_token_delivered: false });
          }
        });
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        runtime.tokenListenerPromise = null;
        throw error;
      });
  }
  await runtime.tokenListenerPromise;
}

async function installReaderListeners(mod: StripeModule) {
  const r = stripeRuntime();
  if (!r.listenersPromise) r.listenersPromise = (async () => {
    const handles: Array<{ remove: () => Promise<void> }> = [];
    try {
      for (const event of [mod.TerminalEventsEnum.DisconnectedReader, mod.TerminalEventsEnum.ReaderReconnectStarted, mod.TerminalEventsEnum.ReaderReconnectSucceeded, mod.TerminalEventsEnum.ReaderReconnectFailed]) {
        handles.push(await (mod.StripeTerminal.addListener as (event: string, callback: () => void) => Promise<{ remove: () => Promise<void> }>)(event, () => {
          if (r.resetPromise || r.resetFailed || !r.configuration || r.configuration.epoch !== r.epoch) return;
          r.sdkReconnecting = event === mod.TerminalEventsEnum.ReaderReconnectStarted;
          if (event === mod.TerminalEventsEnum.ReaderReconnectSucceeded) {
            const epoch = r.epoch;
            const configuration = r.configuration;
            void (async () => {
              const reader = await probeNativeReader(mod);
              assertReaderEpoch(epoch);
              if (reader && configuration) await persistReaderConnection(configuration, reader, epoch);
            })().catch(error => { if (r.epoch === epoch && !r.resetPromise) terminalError(error, "RECONNECT"); });
          } else {
            const id = r.connected?.terminalId || r.configuration?.terminalId;
            r.connected = null;
            localStorage.removeItem("pos.terminal.connectedAt");
            recordReaderDiagnostic(r.sdkReconnecting ? "RECONNECT" : "DISCONNECTED", r.sdkReconnecting ? "pending" : "error", { native_error_code: r.sdkReconnecting ? null : "NATIVE" });
            const message = r.sdkReconnecting ? "Card reader disconnected. Reconnecting…" : "Card reader disconnected. Reconnect it and try again.";
            localStorage.setItem("pos.terminal.lastError", message);
            r.onReaderStatus?.(message);
            // updateStripeTerminal owns the single ordered write queue.
            if (id) void updateStripeTerminal("disconnected", id).catch(() => undefined);
          }
          window.dispatchEvent(new Event("seza:device-config-changed"));
        }));
      }
      const listen = mod.StripeTerminal.addListener as any;
      handles.push(await listen(mod.TerminalEventsEnum.StartInstallingUpdate, () => {
        if (r.resetPromise || !r.configuration) return;
        recordReaderDiagnostic("READER_UPDATE", "pending");
        r.onReaderStatus?.(readerMessage("UPDATING"));
      }));
      handles.push(await listen(mod.TerminalEventsEnum.ReaderSoftwareUpdateProgress, () => {
        if (!r.resetPromise) r.onReaderStatus?.(readerMessage("UPDATING"));
      }));
      handles.push(await listen(mod.TerminalEventsEnum.FinishInstallingUpdate, (event: any) => {
        if (r.resetPromise) return;
        if (event?.error) {
          const code = readerErrorCode({ code: event.error });
          recordReaderDiagnostic("READER_UPDATE", "error", { native_error_code: code === "BATTERY" ? "BATTERY" : "UPDATE" });
          r.onReaderStatus?.(readerMessage(code === "BATTERY" ? "BATTERY" : "UPDATE"));
        } else r.onReaderStatus?.("Card reader update finished. Connecting…");
      }));
    } catch (error) {
      await Promise.all(handles.map(h => h.remove().catch(() => undefined)));
      r.listenersPromise = null;
      throw error;
    }
  })();
  await r.listenersPromise;
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
  const mod = await loadModule();
  const runtime = stripeRuntime();

  // The plugin's native TokenProvider emits RequestedConnectionToken back to JS.
  // The listener MUST exist before the first native initialize().
  await installConnectionTokenListener(mod);
  await installReaderListeners(mod);
  recordReaderDiagnostic("STRIPE_INITIALIZE", "pending", { plugin_linked: true });

  if (runtime.initializedMode !== null && runtime.initializedMode !== testMode) throw readerFailure("RESET");
  if (!runtime.initializePromise) {
    runtime.initializePromise = (async () => {
      await mod.StripeTerminal.initialize({ isTest: testMode });
      runtime.nativeInitialized = true;
      runtime.initializedMode = testMode;
      if (getReaderDiagnostic()?.native_error_code !== "TOKEN") recordReaderDiagnostic("STRIPE_INITIALIZE", "ok", { plugin_initialized: true });
      return mod;
    })().finally(() => { runtime.initializePromise = null; });
  }

  return runtime.initializePromise;
}

async function ensureStripeTerminalPermissions(configuration: TerminalConfiguration) {
  if (!isNativeMode() || configuration.driver === "stripe-simulated" || configuration.driver === "stripe-wisepos") return;
  const { deviceControl } = await import("@/lib/device-control");
  if (configuration.connectionMethod === "usb") {
    recordReaderDiagnostic("ANDROID_USB_DETECTION", "pending", { transport: "usb" });
    const usb = await deviceControl.getTerminalUsbState();
    assertReaderEpoch(configuration.epoch);
    recordReaderDiagnostic("ANDROID_USB_DETECTION", usb.usbDeviceFound ? "ok" : "error", {
      usb_device_found: usb.usbDeviceFound, usb_permission_granted: usb.usbGranted,
      native_error_code: usb.usbDeviceFound ? null : "USB_ABSENT",
    });
    if (!usb.usbDeviceFound) throw readerFailure("USB_ABSENT");
    recordReaderDiagnostic("USB_DEVICE_FOUND", "ok", { usb_device_found: true });
  }
  recordReaderDiagnostic("ANDROID_PERMISSION", "pending", { transport: configuration.connectionMethod });
  const permission = await deviceControl.requestTerminalPermissions(configuration.connectionMethod);
  assertReaderEpoch(configuration.epoch);
  let code: ReaderErrorCode | null = null;
  if (!permission.locationGranted || !permission.bluetoothGranted) code = "PERMISSION";
  else if (configuration.connectionMethod === "usb" && !permission.usbDeviceFound) code = "USB_ABSENT";
  else if (configuration.connectionMethod === "usb" && !permission.usbGranted) code = "USB_PERMISSION";
  else if (!permission.granted) code = "PERMISSION";
  recordReaderDiagnostic("ANDROID_PERMISSION", code ? "error" : "ok", {
    usb_device_found: permission.usbDeviceFound, usb_permission_granted: permission.usbGranted, native_error_code: code,
  });
  if (code) throw readerFailure(code);
}

async function ensureReaderInternal(configuration: TerminalConfiguration, onStatus?: (message: string) => void) {
  const epoch = configuration.epoch;
  assertReaderEpoch(epoch);
  stripeRuntime().configuration = configuration;
  const mod = await initialize(configuration.testMode);
  assertReaderEpoch(epoch);
  const current = await mod.StripeTerminal.getConnectedReader().catch(() => ({ reader: null }));
  assertReaderEpoch(epoch);
  if (current.reader) {
    if (configuration.serial && current.reader.serialNumber !== configuration.serial) throw readerFailure("STALE_READER");
    recordReaderDiagnostic("STRIPE_READER_DISCOVERED", "ok", { reader_discovered: true, reader_serial: current.reader.serialNumber });
    await persistReaderConnection(configuration, current.reader, epoch);
    return { mod, reader: current.reader };
  }

  await ensureStripeTerminalPermissions(configuration);

  assertReaderEpoch(epoch);
  recordReaderDiagnostic(configuration.connectionMethod === "usb" ? "DISCOVER_USB" : "DISCOVER_BLUETOOTH", "pending", { reader_discovered: false });
  onStatus?.("Looking for the card reader…");
  const discovery = await discoverReaderList(mod, configuration);
  const readers = discovery.readers;
  const reader = configuration.serial
    ? readers.find((item) => item?.serialNumber === configuration.serial)
    : readers[0];

  if (!reader) {
    await discovery.stop();
    assertReaderEpoch(epoch);
    const d = getReaderDiagnostic();
    const code = d?.connection_token_requested && !d.connection_token_delivered ? "TOKEN"
      : configuration.serial && readers.length ? "STALE_READER"
      : configuration.connectionMethod === "usb" ? "USB_NOT_ADOPTED" : "DISCOVERY_EMPTY";
    recordReaderDiagnostic(configuration.connectionMethod === "usb" ? "DISCOVER_USB_EMPTY" : "DISCOVER_BLUETOOTH", "error", { native_error_code: code });
    throw readerFailure(code);
  }

  assertReaderEpoch(epoch);
  recordReaderDiagnostic("STRIPE_READER_DISCOVERED", "ok", { reader_discovered: true, reader_serial: reader.serialNumber });
  onStatus?.("Connecting the card reader…");
  recordReaderDiagnostic("CONNECT_READER_NATIVE", "pending", { reader_discovered: true, reader_serial: reader.serialNumber });
  try {
    // Keep Stripe discovery alive until connectReader receives the selected
    // Reader object. Cancelling discovery first can invalidate a mobile reader
    // connection attempt on some Android/USB stacks.
    const connectionOptions = {
      reader,
      locationId: configuration.locationId,
      autoReconnectOnUnexpectedDisconnect: true,
    };
    assertReaderEpoch(epoch);
    await readerDeadline(mod.StripeTerminal.connectReader(connectionOptions), 600_000, "NATIVE");
    assertReaderEpoch(epoch);
  } catch (error) {
    if (stripeRuntime().epoch === epoch && !stripeRuntime().resetPromise) recordReaderDiagnostic("CONNECT_READER_NATIVE", "error", { native_error_code: readerErrorCode(error) });
    throw terminalError(error, "CONNECT_READER_NATIVE");
  } finally {
    await discovery.stop();
  }
  await persistReaderConnection(configuration, reader, epoch);
  return { mod, reader };
}
async function persistReaderConnection(configuration: TerminalConfiguration, reader: any, epoch: number) {
  assertReaderEpoch(epoch);
  await stripeRuntime().readerStatusQueue.catch(() => undefined);
  assertReaderEpoch(epoch);
  recordReaderDiagnostic("READER_API_SAVE", "pending");
  if (!reader.serialNumber) throw readerFailure("SAVE");
  await readerDeadline(updateStripeTerminal("connected", configuration.terminalId, { serial: reader.serialNumber }), 15_000, "SAVE");
  assertReaderEpoch(epoch);
  stripeRuntime().connected = { terminalId: configuration.terminalId, driver: configuration.driver, serial: reader.serialNumber };
  recordReaderDiagnostic("CONNECTED", "ok", { reader_discovered: true, reader_serial: reader.serialNumber });
  localStorage.setItem("pos.stripe.readerSelection", JSON.stringify({ id: configuration.terminalId, store_id: configuration.storeId, serial: reader.serialNumber }));
  localStorage.setItem("pos.terminal.connectedAt", new Date().toISOString());
  localStorage.removeItem("pos.terminal.lastError");
  localStorage.removeItem("pos.terminal.rawError");
  window.dispatchEvent(new Event("seza:device-config-changed"));
}

// Manual pairing, automatic reconnect, and payment checkout can all ask for the
// same M2 connection. Stripe Terminal only allows one discovery/connect flow at
// a time, so share one in-flight promise instead of starting overlapping native
// discovery sessions that can cancel each other or destabilize the Android SDK.
async function ensureReader(configuration: TerminalConfiguration, onStatus?: (message: string) => void) {
  const runtime = stripeRuntime();
  assertReaderEpoch(configuration.epoch);
  if (runtime.sdkReconnecting || runtime.discoveryPromise) throw new Error(READER_CONNECTION_MESSAGE);
  if (runtime.readerConnectPromise) return runtime.readerConnectPromise;

  runtime.readerConnectPromise = ensureReaderInternal(configuration, onStatus).finally(() => {
    runtime.readerConnectPromise = null;
  });
  return runtime.readerConnectPromise;
}

export async function restoreStripeTerminalSelection() {
  try {
    const context = await getStripeTerminalContext();
    const active = selectedStripeTerminal(context);
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
  const runtime = stripeRuntime();
  if (readerOperationBusy()) throw new Error(READER_CONNECTION_MESSAGE);
  runtime.discoveryPromise = (async () => {
    try {
      beginReaderAttempt();
      const configuration = await activeConfiguration(driver);
      runtime.configuration = configuration;
      const mod = await initialize(configuration.testMode);
      assertReaderEpoch(configuration.epoch);
      await ensureStripeTerminalPermissions(configuration);
      assertReaderEpoch(configuration.epoch);
      recordReaderDiagnostic(configuration.connectionMethod === "usb" ? "DISCOVER_USB" : "DISCOVER_BLUETOOTH", "pending");
      const discovery = await discoverReaderList(mod, configuration);
      try {
        assertReaderEpoch(configuration.epoch);
        if (!discovery.readers.length) {
          recordReaderDiagnostic(configuration.connectionMethod === "usb" ? "DISCOVER_USB_EMPTY" : "DISCOVER_BLUETOOTH", "error", {
            native_error_code: configuration.connectionMethod === "usb" && getReaderDiagnostic()?.usb_device_found === true ? "USB_NOT_ADOPTED" : "DISCOVERY_EMPTY",
          });
          throw readerFailure(getReaderDiagnostic()?.native_error_code ?? "DISCOVERY_EMPTY");
        }
        recordReaderDiagnostic("STRIPE_READER_DISCOVERED", "ok", { reader_discovered: true, reader_serial: discovery.readers[0]?.serialNumber });
        return discovery.readers.map(reader => ({ id: String(reader.serialNumber || reader.id || "reader"), label: String(reader.label || reader.serialNumber || "Stripe reader") }));
      } finally { await discovery.stop(); }
    } catch (error) { throw terminalError(error, "DISCOVERY"); }
  })().finally(() => { runtime.discoveryPromise = null; });
  return runtime.discoveryPromise;
}

export async function connectReader(driver: TerminalDriverId, onStatus?: (message: string) => void, setup?: { method: "usb" | "bluetooth" }) {
  const runtime = stripeRuntime();
  if (runtime.resetFailed || runtime.resetPromise) throw readerFailure("RESET");
  if (runtime.connectRequestPromise) return runtime.connectRequestPromise;
  if (runtime.sdkReconnecting || runtime.discoveryPromise) throw readerFailure("BUSY");
  // Take the lock before context retrieval or any other await.
  runtime.connectRequestPromise = (async () => {
    beginReaderAttempt();
    runtime.onReaderStatus = onStatus ?? null;
    let configuration: TerminalConfiguration | null = null;
    let preparedContext: StripeTerminalContext | undefined;
    try {
      if (setup) {
        await ensureCurrentMerchant();
        const epoch = runtime.epoch;
        const context = await connectionContext(onStatus);
        preparedContext = context;
        assertReaderEpoch(epoch);
        if (!context.ready) throw readerFailure(!["active", "enabled"].includes(context.cardPaymentsStatus ?? "") ? "MERCHANT_SETUP" : "LOCATION");
        let terminal = selectedStripeTerminal(context) ?? context.terminals.find(item => item.status === "configured");
        recordReaderDiagnostic("READER_API_CONFIGURE", "pending");
        if (!terminal) {
          const result = await saveStripeTerminal({ label: "Card reader", model: "Reader M2", location: "Front counter", readerType: driver, connectionMethod: setup.method });
          assertReaderEpoch(epoch);
          const auth = await nativeAuth();
          preparedContext = { ...context, terminals: result.terminals.filter(item => !auth || !item.config?.device_id || item.config.device_id === auth.device_id) };
          terminal = result.terminals.find(item => item.status === "configured" && (!auth || item.config?.device_id === auth.device_id));
          if (!terminal) throw readerFailure("CONFIGURE");
        }
        // Selection is configuration, never proof that a physical connection exists.
        setStripeReaderConnectionMethod(terminal.id, setup.method);
        localStorage.setItem("pos.stripe.readerSelection", JSON.stringify({ id: terminal.id, store_id: terminal.store_id, serial: terminal.serial }));
        const [{ setActiveTerminal }, { setActivePaymentProvider }] = await Promise.all([import("./index"), import("@/lib/pos/payment-terminal")]);
        assertReaderEpoch(epoch);
        setActiveTerminal(driver);
        setActivePaymentProvider("stripe-terminal");
        recordReaderDiagnostic("READER_API_CONFIGURE", "ok");
      }
      configuration = await activeConfiguration(driver, preparedContext);
      const { reader } = await ensureReader(configuration, onStatus);
      onStatus?.("Card reader connected.");
      return { terminalId: configuration.terminalId, serialNumber: reader.serialNumber, label: reader.label || reader.serialNumber };
    } catch (error) {
      const safe = terminalError(error, "CONNECT_READER");
      if (configuration && runtime.epoch === configuration.epoch) {
        await updateStripeTerminal("disconnected", configuration.terminalId).catch(() => undefined);
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("pos.terminal.lastError", safe.message);
        localStorage.removeItem("pos.terminal.rawError");
      }
      if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:device-config-changed"));
      throw safe;
    } finally { runtime.onReaderStatus = null; }
  })().finally(() => { runtime.connectRequestPromise = null; });
  return runtime.connectRequestPromise;
}

export function connectedReader() {
  return stripeRuntime().connected?.serial || stripeRuntime().connected?.driver || null;
}

export async function isReady(_driver: TerminalDriverId) {
  if (!isNativeMode()) return false;
  try {
    const epoch = stripeRuntime().epoch;
    assertReaderEpoch(epoch);
    const auth = await nativeAuth();
    const merchant = localStorage.getItem("pos.stripe.sdkMerchant");
    if (!auth || !merchant || merchant !== auth.store_id) return false;
    const mod = await loadModule();
    const reader = await probeNativeReader(mod);
    assertReaderEpoch(epoch);
    if (!reader) { stripeRuntime().connected = null; return false; }

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
    let ready: Awaited<ReturnType<typeof ensureReader>>;
    try {
      const configuration = await activeConfiguration(driver);
      throwIfCancelled();
      ready = await ensureReader(configuration, onStatus);
    } catch (error) {
      if (error instanceof StripePaymentCancelledError) throw error;
      throw terminalError(error, "PREPARE_READER");
    }
    const { mod } = ready;
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

export async function disconnect(options?: { preserveSelection?: boolean }) {
  const runtime = stripeRuntime();
  if (runtime.paymentInFlight || runtime.connectRequestPromise || runtime.readerConnectPromise || runtime.discoveryPromise || runtime.resetPromise || runtime.sdkReconnecting) throw readerFailure("BUSY");
  const terminalId = runtime.connected?.terminalId;

  // Stripe's native disconnectReader() calls Terminal.getInstance() and will
  // crash the Android process if Terminal.initTerminal() has not run yet.
  // A fresh USB connection flow may call disconnect() defensively before the
  // first initialize(), so make that pre-init disconnect a no-op.
  if (runtime.nativeInitialized || runtime.initializedMode !== null) {
    try {
      const mod = await loadModule();
      await mod.StripeTerminal.disconnectReader();
    } catch (error) {
      // Do not claim a disconnect or start a different transport after failure.
      throw terminalError(error, "DISCONNECTED");
    }
  }

  runtime.connected = null;
  if (!options?.preserveSelection) localStorage.removeItem("pos.stripe.readerSelection");
  localStorage.removeItem("pos.terminal.connectedAt");
  recordReaderDiagnostic("DISCONNECTED", "ok");
  window.dispatchEvent(new Event("seza:device-config-changed"));
  if (terminalId) await updateStripeTerminal("disconnected", terminalId).catch(() => undefined);
}

