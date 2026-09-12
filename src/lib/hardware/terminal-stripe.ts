import type { TerminalDriverId } from "./index";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { readMeta } from "@/lib/offline/db";
import { userFacingError } from "@/lib/errors/user-facing";

const REMOTE_API = "https://sezapos.com";

type StripeModule = typeof import("@capacitor-community/stripe-terminal");
type NativeAuth = {
  store_id: string;
  device_id: string;
  device_secret: string;
  caller_id: string;
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
  initializedMode: boolean | null;
  initializePromise: Promise<StripeModule> | null;
  tokenListenerPromise: Promise<void> | null;
  tokenDeliveryQueue: Promise<void>;
  connected: { terminalId: string; driver: TerminalDriverId; serial: string } | null;
};

const STRIPE_RUNTIME_KEY = "__sezaStripeTerminalRuntime";

function stripeRuntime(): StripeTerminalRuntimeState {
  const root = globalThis as typeof globalThis & {
    [STRIPE_RUNTIME_KEY]?: StripeTerminalRuntimeState;
  };

  root[STRIPE_RUNTIME_KEY] ??= {
    modulePromise: null,
    initializedMode: null,
    initializePromise: null,
    tokenListenerPromise: null,
    tokenDeliveryQueue: Promise.resolve(),
    connected: null,
  };

  return root[STRIPE_RUNTIME_KEY]!;
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
  saleId: string;
  amountCents: number;
  idempotencyId: string;
}) {
  return callApi<{ id: string; status: string | null }>("/api/public/pos/stripe-terminal/refund", {
    saleId: input.saleId,
    amount: input.amountCents,
    idempotencyId: input.idempotencyId,
  });
}

async function fetchConnectionToken() {
  const result = await callApi<{ secret: string }>("/api/public/pos/stripe-terminal/connection-token");
  if (!result.secret) throw new Error("Stripe Terminal connection token was empty");
  return result.secret;
}

async function recordPaymentResult(reference: string, status: "completed" | "failed", message: string) {
  await callApi("/api/public/pos/stripe-terminal/payment-result", { reference, status, message }).catch(() => undefined);
}

async function createPaymentIntent(
  amountCents: number,
  currency: string,
  description?: string,
  idempotencyId?: string,
) {
  const startedAt = Date.now();
  const request = callApi<{ id: string; client_secret: string }>(
    "/api/public/pos/stripe-terminal/payment-intent",
    { amount: amountCents, currency, description, idempotencyId },
  );

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => {
      reject(
        new Error(
          `[SEZA-RAW-PAYMENT-INTENT-TIMEOUT] endpoint=/api/public/pos/stripe-terminal/payment-intent waitedMs=${Date.now() - startedAt} amountCents=${amountCents} currency=${currency}`,
        ),
      );
    }, 20_000);
  });

  const result = await Promise.race([request, timeout]);
  if (!result.client_secret) {
    throw new Error(
      `[SEZA-RAW-PAYMENT-INTENT] missing client_secret response=${JSON.stringify(result)}`,
    );
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
  const context = await getStripeTerminalContext();
  if (!context.ready || !context.locationId) {
    throw new Error("Stripe merchant setup is not ready. Finish verification and payout setup in the Owner Dashboard.");
  }
  const terminal = context.terminals.find((item) => item.status === "active");
  if (!terminal) throw new Error("No Stripe reader is active. Open Payment terminal and pair a reader.");
  const driver = driverForTerminal(terminal, preferred);
  if (!driver || driver === "none") throw new Error("The active Stripe reader type is not configured.");
  return {
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
      (String(terminal.config?.connection_method || "bluetooth").toLowerCase() === "bluetooth"
        ? "bluetooth"
        : "usb"),
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

function rawTerminalError(error: unknown, stage: string): Error {
  if (error instanceof Error && error.message.startsWith("[SEZA-RAW-STRIPE]")) {
    return error;
  }

  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;

  const values: string[] = [];

  if (error instanceof Error) {
    values.push(`name=${error.name || "Error"}`);
    values.push(`message=${error.message || "(empty)"}`);
  } else if (typeof error === "string") {
    values.push(`message=${error}`);
  }

  if (record) {
    for (const key of [
      "code",
      "errorCode",
      "localizedMessage",
      "details",
      "reason",
      "type",
      "message",
    ]) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        const rendered =
          typeof value === "object"
            ? (() => {
                try {
                  return JSON.stringify(value);
                } catch {
                  return String(value);
                }
              })()
            : String(value);
        const entry = `${key}=${rendered}`;
        if (!values.includes(entry)) values.push(entry);
      }
    }

    try {
      const json = JSON.stringify(record);
      if (json && json !== "{}") values.push(`json=${json}`);
    } catch {
      // Raw diagnostics are best-effort only.
    }
  }

  if (!values.length) values.push(`value=${String(error)}`);

  const message = `[SEZA-RAW-STRIPE] stage=${stage} | ${values.join(" | ")}`;
  console.error(message, error);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem("pos.terminal.rawError", message);
  }

  return new Error(message);
}

async function discoverReaderList(
  mod: StripeModule,
  configuration: TerminalConfiguration,
): Promise<{ readers: any[]; stop: () => Promise<void> }> {
  let listener: { remove: () => Promise<void> } | null = null;
  let resolveEventReaders: ((readers: any[]) => void) | null = null;
  let settled = false;

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
      throw rawTerminalError(error, "DISCOVER_READERS");
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

async function initialize(testMode: boolean) {
  const mod = await loadModule();
  const runtime = stripeRuntime();

  runtime.tokenListenerPromise ??= mod.StripeTerminal
    .addListener(mod.TerminalEventsEnum.RequestedConnectionToken, () => {
      runtime.tokenDeliveryQueue = runtime.tokenDeliveryQueue
        .catch(() => undefined)
        .then(async () => {
          try {
            const token = await fetchConnectionToken();
            await mod.StripeTerminal.setConnectionToken({ token });
          } catch (error) {
            console.error("[SEZA Terminal] connection token failed", error);
          }
        });
    })
    .then(() => undefined)
    .catch((error) => {
      runtime.tokenListenerPromise = null;
      throw error;
    });

  await runtime.tokenListenerPromise;

  if (runtime.initializedMode === testMode) return mod;

  if (runtime.initializePromise) {
    await runtime.initializePromise;
    if (runtime.initializedMode === testMode) return mod;
  }

  runtime.initializePromise = (async () => {
    await mod.StripeTerminal.initialize({ isTest: testMode });
    runtime.initializedMode = testMode;
    return mod;
  })();

  try {
    return await runtime.initializePromise;
  } finally {
    runtime.initializePromise = null;
  }
}

async function ensureReader(configuration: TerminalConfiguration, onStatus?: (message: string) => void) {
  const mod = await initialize(configuration.testMode);
  const current = await mod.StripeTerminal.getConnectedReader().catch(() => ({ reader: null }));
  if (current.reader) {
    stripeRuntime().connected = {
      terminalId: configuration.terminalId,
      driver: configuration.driver,
      serial: current.reader.serialNumber || configuration.serial || configuration.driver,
    };
    return { mod, reader: current.reader };
  }

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
    throw new Error(
      configuration.driver === "stripe-m2" && configuration.connectionMethod === "usb"
        ? "No Stripe Reader M2 was found over USB. Check power, the data cable, and Android USB permission."
        : "No Stripe reader was found. Check reader power, Bluetooth/location permissions, and try again.",
    );
  }

  onStatus?.(`Connecting ${reader.label || reader.serialNumber}…`);
  try {
    // Keep Stripe discovery alive until connectReader receives the selected
    // Reader object. Cancelling discovery first can invalidate a mobile reader
    // connection attempt on some Android/USB stacks.
    await mod.StripeTerminal.connectReader({
      reader,
      locationId: configuration.locationId,
      autoReconnectOnUnexpectedDisconnect: true,
    });
  } catch (error) {
    throw rawTerminalError(error, "CONNECT_READER_NATIVE");
  } finally {
    await discovery.stop();
  }
  stripeRuntime().connected = {
    terminalId: configuration.terminalId,
    driver: configuration.driver,
    serial: reader.serialNumber,
  };
  await updateStripeTerminal("connected", configuration.terminalId, { serial: reader.serialNumber });
  localStorage.setItem("pos.terminal.connectedAt", new Date().toISOString());
  localStorage.removeItem("pos.terminal.lastError");
  window.dispatchEvent(new Event("seza:device-config-changed"));
  return { mod, reader };
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
  } catch (error) {
    const raw = rawTerminalError(error, "CONNECT_READER");
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("pos.terminal.lastError", raw.message);
      localStorage.setItem("pos.terminal.rawError", raw.message);
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:device-config-changed"));
    throw raw;
  }
}

export function connectedReader() {
  return stripeRuntime().connected?.serial || stripeRuntime().connected?.driver || null;
}

export async function isReady(_driver: TerminalDriverId) {
  const runtime = stripeRuntime();
  if (runtime.initializedMode === null) return Boolean(runtime.connected);

  try {
    const mod = await loadModule();
    const result = await mod.StripeTerminal.getConnectedReader();
    return Boolean(result.reader);
  } catch {
    return false;
  }
}

export async function charge(
  driver: TerminalDriverId,
  input: { amountCents: number; currency: string; description?: string; idempotencyId?: string },
  onStatus?: (message: string) => void,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  let paymentIntentId = "";
  try {
    const configuration = await activeConfiguration(driver);
    const { mod } = await ensureReader(configuration, onStatus);
    onStatus?.("Creating secure card-present payment…");
    const intent = await createPaymentIntent(input.amountCents, input.currency, input.description, input.idempotencyId);
    paymentIntentId = intent.id;
    onStatus?.("Ask the customer to tap, insert, or swipe…");
    await mod.StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
    onStatus?.("Processing payment…");
    await mod.StripeTerminal.confirmPaymentIntent();
    await recordPaymentResult(intent.id, "completed", "Stripe Terminal payment approved");
    onStatus?.("Payment approved");
    return { ok: true, ref: intent.id };
  } catch (error) {
    const message = rawTerminalError(error, "PAYMENT_FLOW").message;
    if (paymentIntentId) await recordPaymentResult(paymentIntentId, "failed", message);
    if (typeof localStorage !== "undefined") localStorage.setItem("pos.terminal.lastError", message);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:device-config-changed"));
    return { ok: false, error: message };
  }
}

export async function cancelActivePayment() {
  try {
    const mod = await loadModule();
    await mod.StripeTerminal.cancelCollectPaymentMethod();
  } catch {
    // There may be no active payment collection to cancel.
  }
}

export async function disconnect() {
  const runtime = stripeRuntime();
  const terminalId = runtime.connected?.terminalId;
  try {
    const mod = await loadModule();
    await mod.StripeTerminal.disconnectReader();
  } catch {
    // Treat an already-disconnected reader as successfully disconnected.
  }
  runtime.connected = null;
  if (terminalId) await updateStripeTerminal("disconnected", terminalId).catch(() => undefined);
}
