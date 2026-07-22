import type { TerminalDriverId } from "./index";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";

const REMOTE_API = "https://sezapos.com";

type StripeModule = typeof import("@capacitor-community/stripe-terminal");
type TerminalConfiguration = {
  driver: TerminalDriverId;
  locationId: string;
  testMode: boolean;
  serial?: string | null;
};

let modulePromise: Promise<StripeModule> | null = null;
let initializedMode: boolean | null = null;
let tokenListenerInstalled = false;
let connected: { driver: TerminalDriverId; serial: string } | null = null;

function apiBase() {
  if (typeof window === "undefined") return REMOTE_API;
  return isNativeMode() ? REMOTE_API : window.location.origin;
}

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your employee session has expired. Sign in again.");
  return token;
}

async function callApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await bearer()}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || `SEZA payment service error ${response.status}`));
  return payload as T;
}

async function fetchConnectionToken() {
  const result = await callApi<{ secret: string }>("/api/public/pos/stripe-terminal/connection-token");
  if (!result.secret) throw new Error("Stripe Terminal connection token was empty");
  return result.secret;
}

async function createPaymentIntent(amountCents: number, currency: string, description?: string) {
  const result = await callApi<{ id: string; client_secret: string }>("/api/public/pos/stripe-terminal/payment-intent", {
    amount: amountCents,
    currency,
    description,
  });
  if (!result.client_secret) throw new Error("Stripe Terminal PaymentIntent was not created");
  return result;
}

async function loadModule(): Promise<StripeModule> {
  if (!isNativeMode()) throw new Error("Stripe Terminal payments are available in the SEZA Android POS app");
  modulePromise ??= import("@capacitor-community/stripe-terminal");
  return modulePromise;
}

async function activeConfiguration(preferred?: TerminalDriverId): Promise<TerminalConfiguration> {
  const { data, error } = await (supabase.from as any)("payment_terminals")
    .select("provider,serial,config,status")
    .eq("status", "active")
    .in("provider", ["stripe-tap-to-pay", "stripe-wisepos", "stripe-wisepad3", "stripe"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const config = (data?.config ?? {}) as Record<string, unknown>;
  const driver = (preferred && preferred !== "none" ? preferred : (config.reader_type || data?.provider)) as TerminalDriverId;
  const locationId = String(config.location_id || "").trim();
  if (!data || !driver || driver === "none") throw new Error("Activate a Stripe Terminal in Owner Dashboard → Settings → Payment terminals");
  if (!locationId) throw new Error("Add the Stripe Terminal Location ID (tml_…) to the active terminal configuration");
  return {
    driver: driver === "stripe" ? "stripe-tap-to-pay" : driver,
    locationId,
    testMode: config.test_mode !== false,
    serial: data.serial,
  };
}

function connectionType(mod: StripeModule, driver: TerminalDriverId) {
  if (driver === "stripe-wisepos") return mod.TerminalConnectTypes.Internet;
  if (driver === "stripe-wisepad3") return mod.TerminalConnectTypes.Bluetooth;
  return mod.TerminalConnectTypes.TapToPay;
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
      try { await mod.StripeTerminal.disconnectReader(); } catch { /* no active reader */ }
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
  if (current.reader && connected?.driver === configuration.driver) return { mod, reader: current.reader };

  onStatus?.("Discovering Stripe reader…");
  const result = await mod.StripeTerminal.discoverReaders({
    type: connectionType(mod, configuration.driver),
    locationId: configuration.locationId,
  });
  const reader = configuration.serial
    ? result.readers.find((item) => item.serialNumber === configuration.serial) ?? result.readers[0]
    : result.readers[0];
  if (!reader) throw new Error("No Stripe reader was found. Confirm Bluetooth, NFC, location permission, and the Stripe Location ID.");

  onStatus?.(`Connecting ${reader.label || reader.serialNumber}…`);
  await mod.StripeTerminal.connectReader({ reader, autoReconnectOnUnexpectedDisconnect: true });
  connected = { driver: configuration.driver, serial: reader.serialNumber };
  return { mod, reader };
}

export async function pluginAvailable() {
  try { await loadModule(); return true; } catch { return false; }
}

export async function discoverReaders(driver: TerminalDriverId) {
  const configuration = await activeConfiguration(driver);
  const mod = await initialize(configuration.testMode);
  const result = await mod.StripeTerminal.discoverReaders({ type: connectionType(mod, configuration.driver), locationId: configuration.locationId });
  return result.readers.map((reader) => ({ id: reader.serialNumber, label: reader.label || reader.serialNumber }));
}

export function connectedReader() { return connected?.driver ?? null; }

export async function isReady(driver: TerminalDriverId) {
  try {
    const configuration = await activeConfiguration(driver);
    const mod = await initialize(configuration.testMode);
    const result = await mod.StripeTerminal.getConnectedReader();
    return !!result.reader;
  } catch { return false; }
}

export async function charge(
  driver: TerminalDriverId,
  input: { amountCents: number; currency: string; description?: string },
  onStatus?: (message: string) => void,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  try {
    const configuration = await activeConfiguration(driver);
    const { mod } = await ensureReader(configuration, onStatus);
    onStatus?.("Creating secure card-present payment…");
    const intent = await createPaymentIntent(input.amountCents, input.currency, input.description);
    onStatus?.("Ask the customer to tap, insert, or swipe…");
    await mod.StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
    onStatus?.("Processing payment…");
    await mod.StripeTerminal.confirmPaymentIntent();
    onStatus?.("Payment approved");
    return { ok: true, ref: intent.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Stripe Terminal payment failed" };
  }
}

export async function disconnect() {
  try {
    const mod = await loadModule();
    await mod.StripeTerminal.disconnectReader();
  } catch { /* safe disconnect */ }
  connected = null;
}
