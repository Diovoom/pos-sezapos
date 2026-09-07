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

let modulePromise: Promise<StripeModule> | null = null;
let initializedMode: boolean | null = null;
let tokenListenerInstalled = false;
let connected: { terminalId: string; driver: TerminalDriverId; serial: string } | null = null;

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
  action: "activate" | "connected" | "disconnected" | "remove",
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
  const result = await callApi<{ id: string; client_secret: string }>(
    "/api/public/pos/stripe-terminal/payment-intent",
    { amount: amountCents, currency, description, idempotencyId },
  );
  if (!result.client_secret) throw new Error("Stripe Terminal PaymentIntent was not created");
  return result;
}

async function loadModule(): Promise<StripeModule> {
  if (!isNativeMode()) throw new Error("Stripe Terminal is available in the SEZA Android POS app.");
  modulePromise ??= import("@capacitor-community/stripe-terminal");
  return modulePromise;
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
    testMode: context.environment === "sandbox",
    connectionMethod:
      String(terminal.config?.connection_method || "usb").toLowerCase() === "bluetooth"
        ? "bluetooth"
        : "usb",
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

function friendlyTerminalError(error: unknown, fallback: string): Error {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

  // This was reaching the cashier UI verbatim from the native Stripe bridge.
  // Never expose JavaScript/runtime diagnostics to a merchant.
  if (/cannot read (?:properties|property) of (?:undefined|null).*reading ['"]?0|undefined.*\[0\]/i.test(raw)) {
    return new Error(
      "Stripe Reader M2 was not returned by Android. Reconnect the USB cable, allow USB access if prompted, then try again.",
    );
  }
  if (/usb.*permission|permission.*usb|permission (?:was )?denied/i.test(raw)) {
    return new Error("USB access is required for Reader M2. Reconnect the reader and allow USB access.");
  }

  return new Error(userFacingError(error, fallback));
}

async function discoverReaderList(
  mod: StripeModule,
  configuration: TerminalConfiguration,
): Promise<any[]> {
  let eventReaders: any[] = [];
  let listener: { remove: () => Promise<void> } | null = null;

  try {
    listener = await mod.StripeTerminal.addListener(
      mod.TerminalEventsEnum.DiscoveredReaders,
      (event: unknown) => {
        const next = readerList(event);
        if (next.length) eventReaders = next;
      },
    );
  } catch {
    listener = null;
  }

  try {
    let result: unknown;
    try {
      result = await mod.StripeTerminal.discoverReaders({
        type: connectionType(mod, configuration.driver, configuration.connectionMethod),
        locationId: configuration.locationId,
      });
    } catch (error) {
      throw friendlyTerminalError(error, "Could not search for the Stripe card reader.");
    }
    let readers = readerList(result);

    if (!readers.length && !eventReaders.length) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    if (!readers.length) readers = eventReaders;

    if (!readers.length) {
      await mod.StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
    }
    return readers;
  } finally {
    if (listener) await listener.remove().catch(() => undefined);
  }
}

async function initialize(testMode: boolean) {
  const mod = await loadModule();
  if (!tokenListenerInstalled) {
    await mod.StripeTerminal.addListener(mod.TerminalEventsEnum.RequestedConnectionToken, async () => {
      try {
        await mod.StripeTerminal.setConnectionToken({ token: await fetchConnectionToken() });
      } catch (error) {
        console.error("[SEZA Terminal] connection token failed", error);
      }
    });
    tokenListenerInstalled = true;
  }
  if (initializedMode !== testMode) {
    if (initializedMode !== null) {
      try {
        await mod.StripeTerminal.disconnectReader();
      } catch {
        // Best-effort disconnect while switching Stripe Terminal modes.
      }
      connected = null;
    }
    await mod.StripeTerminal.initialize({ isTest: testMode });
    initializedMode = testMode;
  }
  return mod;
}

async function ensureReader(configuration: TerminalConfiguration, onStatus?: (message: string) => void) {
  const mod = await initialize(configuration.testMode);
  const current = await mod.StripeTerminal.getConnectedReader().catch(() => ({ reader: null }));
  if (current.reader && connected?.terminalId === configuration.terminalId) return { mod, reader: current.reader };

  onStatus?.("Discovering Stripe reader…");
  const readers = await discoverReaderList(mod, configuration);
  const reader = configuration.serial
    ? readers.find((item) => item?.serialNumber === configuration.serial) ?? readers[0]
    : readers[0];
  if (!reader) {
    throw new Error(
      configuration.driver === "stripe-m2" && configuration.connectionMethod === "usb"
        ? "No Stripe Reader M2 was found over USB. Check power, the data cable, and Android USB permission."
        : "No Stripe reader was found. Check reader power, Bluetooth/location permissions, and try again.",
    );
  }

  onStatus?.(`Connecting ${reader.label || reader.serialNumber}…`);
  try {
    await mod.StripeTerminal.connectReader({ reader, autoReconnectOnUnexpectedDisconnect: true });
  } catch (error) {
    throw friendlyTerminalError(error, "Could not connect to the Stripe card reader.");
  }
  connected = {
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
  const readers = await discoverReaderList(mod, configuration);
  return readers.map((reader) => ({
    id: String(reader?.serialNumber || reader?.id || "reader"),
    label: String(reader?.label || reader?.serialNumber || "Stripe reader"),
  }));
}

export async function connectReader(driver: TerminalDriverId, onStatus?: (message: string) => void) {
  try {
    const configuration = await activeConfiguration(driver);
    const { reader } = await ensureReader(configuration, onStatus);
    return { terminalId: configuration.terminalId, serialNumber: reader.serialNumber, label: reader.label || reader.serialNumber };
  } catch (error) {
    const friendly = friendlyTerminalError(error, "Could not connect to the Stripe card reader.");
    if (typeof localStorage !== "undefined") localStorage.setItem("pos.terminal.lastError", friendly.message);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:device-config-changed"));
    throw friendly;
  }
}

export function connectedReader() {
  return connected?.serial || connected?.driver || null;
}

export async function isReady(driver: TerminalDriverId) {
  try {
    const configuration = await activeConfiguration(driver);
    const mod = await initialize(configuration.testMode);
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
    const message = friendlyTerminalError(error, "Stripe Terminal payment failed. Please try again.").message;
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
  const terminalId = connected?.terminalId;
  try {
    const mod = await loadModule();
    await mod.StripeTerminal.disconnectReader();
  } catch {
    // Treat an already-disconnected reader as successfully disconnected.
  }
  connected = null;
  if (terminalId) await updateStripeTerminal("disconnected", terminalId).catch(() => undefined);
}
