// Stripe Terminal driver. Uses a Capacitor-compatible Stripe Terminal
// plugin at runtime — we resolve the module lazily so a build without the
// plugin still succeeds; the driver just reports capable=false.
//
// Reader kinds:
//   stripe-tap-to-pay  → Android Tap to Pay (no external hardware)
//   stripe-wisepos     → BBPOS WisePOS E over Wi-Fi
//   stripe-wisepad3    → BBPOS WisePad 3 over Bluetooth
//
// A production install needs:
//   1. `bun add @capacitor-community/stripe-terminal` (or the equivalent
//      Stripe-Terminal plugin the merchant's Android build ships).
//   2. A backend endpoint that mints Stripe Terminal connection tokens —
//      we call POST /api/public/pos/stripe-terminal/connection-token
//      (Bearer token from the current employee session).
//
// Everything below is pure JS: no vendor SDK is imported statically, so
// the Vite build never fails when the plugin is absent.

import type { TerminalDriverId } from "./index";
import { isNativeMode } from "@/lib/native";

const API_BASE = "https://sezapos.com";

async function bearer(): Promise<string | null> {
  try {
    const mod = await import("@/integrations/supabase/client");
    const { data } = await mod.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

async function fetchConnectionToken(): Promise<string> {
  const token = await bearer();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}/api/public/pos/stripe-terminal/connection-token`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`Could not fetch Terminal connection token (${res.status})`);
  const j = (await res.json()) as { secret?: string };
  if (!j.secret) throw new Error("Malformed connection-token response");
  return j.secret;
}

async function createPaymentIntent(amountCents: number, currency: string, description?: string): Promise<string> {
  const token = await bearer();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}/api/public/pos/stripe-terminal/payment-intent`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ amount: amountCents, currency, description }),
  });
  if (!res.ok) {
    let msg = `PaymentIntent failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* ignore */ }
    throw new Error(msg);
  }
  const j = (await res.json()) as { client_secret?: string };
  if (!j.client_secret) throw new Error("Malformed PaymentIntent response");
  return j.client_secret;
}

/* --------------------------- plugin loader (lazy) ------------------------- */

type UnknownRecord = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let plugin: any | null = null;

async function loadPlugin(): Promise<UnknownRecord | null> {
  if (plugin) return plugin;
  if (!isNativeMode()) return null;
  // Runtime dynamic import — Vite must not statically resolve this name.
  const name = "@capacitor-community/stripe-terminal";
  try {
    plugin = await import(/* @vite-ignore */ name);
    return plugin;
  } catch { return null; }
}

/* ------------------------------- lifecycle ------------------------------- */

let initialized = false;
let currentReader: string | null = null;

async function ensureInit(readerKind: TerminalDriverId): Promise<UnknownRecord | null> {
  const p = await loadPlugin();
  if (!p) return null;
  if (!initialized) {
    // Different plugins expose different init shapes. Try the common ones.
    const initCandidates = ["initialize", "init", "initTerminal"];
    for (const fn of initCandidates) {
      const f = (p as UnknownRecord)[fn];
      if (typeof f === "function") {
        try { await (f as (o: unknown) => Promise<void>)({ tokenProvider: fetchConnectionToken }); initialized = true; break; }
        catch { /* try next */ }
      }
    }
  }
  if (currentReader !== readerKind) {
    // Discovery + connect. Kept minimal; a real merchant flow lives in
    // Settings → Payment Terminal (pair UI). We only ensure a reader is
    // connected before charging.
    const connectFn =
      (p as UnknownRecord).connectReader ??
      (p as UnknownRecord).connect ??
      null;
    if (typeof connectFn === "function") {
      try {
        await (connectFn as (o: unknown) => Promise<void>)({ kind: readerKind });
        currentReader = readerKind;
      } catch { /* stay disconnected */ }
    }
  }
  return p;
}

export async function pluginAvailable(): Promise<boolean> {
  return (await loadPlugin()) != null;
}

export async function isTapToPaySupported(): Promise<boolean> {
  const p = await loadPlugin();
  if (!p) return false;
  const check = (p as UnknownRecord).isTapToPaySupported;
  if (typeof check !== "function") return false;
  try {
    const r = await (check as () => Promise<{ supported: boolean }>)();
    return !!r.supported;
  } catch { return false; }
}

export async function discoverReaders(readerKind: TerminalDriverId): Promise<Array<{ id: string; label: string }>> {
  const p = await loadPlugin();
  if (!p) return [];
  const fn = (p as UnknownRecord).discoverReaders ?? (p as UnknownRecord).discover;
  if (typeof fn !== "function") return [];
  try {
    const out = (await (fn as (o: unknown) => Promise<{ readers?: Array<{ id?: string; serialNumber?: string; label?: string }> }>)({ kind: readerKind })) ?? {};
    return (out.readers ?? []).map((r) => ({
      id: r.id ?? r.serialNumber ?? "unknown",
      label: r.label ?? r.serialNumber ?? r.id ?? "Reader",
    }));
  } catch { return []; }
}

export function connectedReader(): TerminalDriverId | null {
  return (currentReader as TerminalDriverId | null) ?? null;
}

export async function isReady(readerKind: TerminalDriverId): Promise<boolean> {
  const p = await loadPlugin();
  if (!p) return false;
  if (readerKind === "stripe-tap-to-pay") {
    return await isTapToPaySupported();
  }
  return currentReader === readerKind;
}


export async function charge(
  readerKind: TerminalDriverId,
  input: { amountCents: number; currency: string; description?: string },
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  try {
    const p = await ensureInit(readerKind);
    if (!p) {
      return {
        ok: false,
        error:
          "Stripe Terminal plugin is not installed in this build. Add " +
          "@capacitor-community/stripe-terminal, rebuild, and try again.",
      };
    }
    const clientSecret = await createPaymentIntent(input.amountCents, input.currency, input.description);
    const collectFn =
      (p as UnknownRecord).collectPaymentMethod ??
      (p as UnknownRecord).collect ??
      null;
    const processFn =
      (p as UnknownRecord).processPayment ??
      (p as UnknownRecord).confirm ??
      null;
    if (typeof collectFn !== "function" || typeof processFn !== "function") {
      return { ok: false, error: "Stripe Terminal plugin API is unrecognized." };
    }
    await (collectFn as (o: unknown) => Promise<void>)({ clientSecret });
    const r = (await (processFn as (o: unknown) => Promise<{ paymentIntent?: { id?: string } }>)({ clientSecret })) ?? {};
    const ref = r.paymentIntent?.id ?? clientSecret.split("_secret_")[0] ?? "pi_unknown";
    return { ok: true, ref };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Terminal error" };
  }
}

export async function disconnect(): Promise<void> {
  const p = await loadPlugin();
  if (!p) return;
  const fn = (p as UnknownRecord).disconnectReader ?? (p as UnknownRecord).disconnect;
  if (typeof fn === "function") { try { await (fn as () => Promise<void>)(); } catch { /* ignore */ } }
  currentReader = null;
}
