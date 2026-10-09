import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient } from "@/lib/stripe.server";
import { loadStripeTerminalStore, requireStripeTerminalManager, type StripeTerminalCaller } from "@/lib/stripe-terminal.server";
import type { ReaderSetup, ReaderSetupStep } from "@/lib/hardware/reader-setup";

const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
export function hasReaderAddress(store: any) {
  return [store.address, store.city, store.state, store.zip, store.country].every(v => Boolean(text(v)));
}

// Accounts v1 reads also support v2-created account IDs. Use explicit current
// requirements, never a generic capability failure, to identify a missing bank.
export function accountSetupStep(account: any): ReaderSetupStep | null {
  const requirements = account.requirements;
  if (!requirements || !Array.isArray(requirements.currently_due) || !Array.isArray(requirements.past_due)) return "retry";
  const due: string[] = [...requirements.currently_due, ...requirements.past_due];
  const bank = (key: string) => /(^|\.)(external_account|bank_account)(\.|$)/.test(key);
  if (due.some(key => !bank(key))) return "verification";
  if (due.some(bank)) return "bank";
  if (account.capabilities?.card_payments === "active" && account.charges_enabled === true) return null;
  if (requirements.pending_verification?.length || requirements.disabled_reason === "requirements.pending_verification") return "review";
  // Restricted/rejected/unknown accounts aren't evidence of missing information.
  return "retry";
}

function missing(error: any) {
  return error?.code === "resource_missing" || error?.statusCode === 404;
}

export async function ensureReaderLocation(stripe: any, accountId: string, store: any): Promise<string | null> {
  const old = text(store.stripe_terminal_location_id);
  if (old) {
    try {
      const location = await stripe.terminal.locations.retrieve(old, {}, { stripeAccount: accountId, timeout: 8000, maxNetworkRetries: 0 });
      if (location?.id && !location.deleted) return location.id;
    } catch (error) { if (!missing(error)) throw error; }
  }
  // Recover a prior successful creation even when the database save was lost.
  const locations = await stripe.terminal.locations.list({ limit: 100 }, { stripeAccount: accountId, timeout: 8000, maxNetworkRetries: 0 }).autoPagingToArray({ limit: 1000 });
  const recovered = locations.find((location: any) => !location.deleted && location.metadata?.seza_store_id === store.id);
  if (recovered) return recovered.id;
  if (locations.length >= 1000) throw new Error("Location lookup incomplete");
  if (!hasReaderAddress(store)) return null;
  const address = { line1: text(store.address), city: text(store.city), state: text(store.state), postal_code: text(store.zip), country: text(store.country).toUpperCase() };
  // Stable across retries and workers; account/address changes get a new key.
  const bytes = new TextEncoder().encode(JSON.stringify([store.id, accountId, old, address]));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
  const location = await stripe.terminal.locations.create({ display_name: text(store.name).slice(0, 100) || "SEZA POS Store", address, metadata: { seza_store_id: store.id } }, { stripeAccount: accountId, timeout: 8000, maxNetworkRetries: 0, idempotencyKey: `seza-reader-location-${hash}` });
  if (!location?.id) throw new Error("Location unavailable");
  return location.id;
}

export async function loadReaderSetup(caller: StripeTerminalCaller): Promise<ReaderSetup> {
  const result = (step: ReaderSetupStep): ReaderSetup => ({ step, checkedAt: new Date().toISOString() });
  // Setup mutations are restricted independently of device authentication.
  await requireStripeTerminalManager(caller);
  const state = await loadStripeTerminalStore(caller);
  if (!state.accountId) return result("connect_stripe");
  const stripe = createStripeClient(state.environment);
  let account: any;
  try {
    account = await stripe.accounts.retrieve(state.accountId, {}, { timeout: 8000, maxNetworkRetries: 0 });
  } catch { return result("retry"); }
  if (account.deleted || account.id !== state.accountId || account.livemode !== (state.environment === "live")) return result("retry");
  const next = accountSetupStep(account);
  if (next) return result(next);
  let locationId: string | null;
  try { locationId = await ensureReaderLocation(stripe, state.accountId, state.store); }
  catch { return result("location"); }
  if (!locationId) return result("address");
  if (state.locationId !== locationId || state.cardStatus !== "active" || state.store.stripe_connect_status !== "ready") {
    // Compare-and-set: a concurrent merchant/account change must not receive
    // readiness or a location belonging to the old Stripe account.
    let update = (supabaseAdmin as any).from("stores").update({ stripe_terminal_location_id: locationId, stripe_card_payments_status: "active", stripe_connect_status: "ready" })
      .eq("id", caller.storeId).eq("stripe_connected_account_id", state.accountId);
    update = state.locationId ? update.eq("stripe_terminal_location_id", state.locationId) : update.is("stripe_terminal_location_id", null);
    const { data, error } = await update.select("id").maybeSingle();
    if (error || !data) return result("retry");
  }
  return result("reader");
}
