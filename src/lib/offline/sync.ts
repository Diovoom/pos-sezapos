// Sync driver: drains offline queue to Supabase.
//
// Guarantees:
// - Single-flight: only one sync worker runs at a time.
// - Auth-gated: never syncs without an authenticated session.
// - Idempotent: sales.idempotency_key + cash_movements.idempotency_key are
//   UNIQUE on the server. A 23505 duplicate is treated as already-accepted.
// - Recovery: stale "syncing" records are recovered on module init so a
//   crash / process kill never strands a queued sale.
// - Backoff: temporary failures schedule a next_retry_at with exponential
//   backoff + jitter. Permanent failures move to "needs_attention" and are
//   surfaced to the operator instead of retried indefinitely.
import { supabase } from "@/integrations/supabase/client";
import {
  getPendingSales,
  getPendingCashMovements,
  updateOfflineSale,
  updateOfflineCashMovement,
  getAllOfflineSales,
  recoverStaleSyncing,
  type OfflineSale,
  type OfflineCashMovement,
} from "./db";
import { emitSync } from "./useOnline";

let syncing = false;
let lastSync: string | null = null;

export function getLastSync() { return lastSync; }

// PostgREST / Supabase error codes that will never succeed on retry.
// Anything else is treated as temporary and gets exponential backoff.
const PERMANENT_CODES = new Set<string>([
  "42501", // insufficient_privilege / RLS denial
  "PGRST301", "PGRST302", "PGRST116", // rls / row not found
  "23503", // fk violation (product / shift deleted)
  "23514", // check constraint violation
  "22P02", // invalid input
]);

function isPermanent(err: { code?: string; message?: string; status?: number } | null | undefined) {
  if (!err) return false;
  if (err.code && PERMANENT_CODES.has(err.code)) return true;
  if (err.status === 401 || err.status === 403 || err.status === 422) return true;
  return false;
}

function scheduleBackoff(attempts: number): string {
  // Bounded exponential backoff with jitter: 5s, 15s, 45s, 2m, 5m, capped 10m.
  const base = Math.min(600_000, 5_000 * Math.pow(3, Math.max(0, attempts - 1)));
  const jitter = Math.random() * Math.min(base, 30_000);
  return new Date(Date.now() + base + jitter).toISOString();
}

async function syncSale(sale: OfflineSale): Promise<void> {
  const nowIso = new Date().toISOString();
  await updateOfflineSale(sale.id, {
    status: "syncing",
    attempts: sale.attempts + 1,
    last_attempt_at: nowIso,
    updated_at: nowIso,
  });

  // Insert header. Client sets id + idempotency_key so a retry conflicts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saleRow, error: saleErr } = await (supabase.from as any)("sales")
    .insert({
      id: sale.id,
      store_id: sale.store_id,
      cashier_id: sale.cashier_id,
      subtotal: sale.subtotal,
      tax: sale.tax,
      discount: sale.discount,
      total: sale.total,
      payment_method: "cash",
      amount_tendered: sale.amount_tendered,
      change_due: sale.change_due,
      register_session_id: sale.register_session_id,
      status: "completed",
      customer_name: sale.customer_name,
      idempotency_key: sale.idempotency_key,
      synced_from_offline: true,
      offline_created_at: sale.local_created_at,
    })
    .select()
    .maybeSingle();

  const isDuplicate = saleErr?.code === "23505";
  if (saleErr && !isDuplicate) {
    const permanent = isPermanent(saleErr);
    await updateOfflineSale(sale.id, {
      status: permanent ? "needs_attention" : "failed",
      last_error: saleErr.message,
      last_error_code: saleErr.code ?? null,
      next_retry_at: permanent ? null : scheduleBackoff(sale.attempts + 1),
      updated_at: new Date().toISOString(),
    });
    throw saleErr;
  }

  // If duplicate: fetch existing sale row (already synced previously)
  let finalSale = saleRow;
  if (isDuplicate) {
    const { data: existing } = await supabase
      .from("sales")
      .select("id,receipt_number")
      .eq("idempotency_key", sale.idempotency_key)
      .maybeSingle();
    finalSale = existing;
  }

  // Insert items only if header freshly created; the DB stock trigger fires
  // exactly once because items only insert on the fresh row.
  if (!isDuplicate && finalSale) {
    const items = sale.items.map((l) => ({
      sale_id: finalSale.id,
      product_id: l.product_id,
      product_name: l.product_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    }));
    const { error: itemsErr } = await supabase.from("sale_items").insert(items);
    if (itemsErr) {
      // Roll back header so retry can re-insert (dedupe still protects us).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from as any)("sales").delete().eq("id", finalSale.id);
      } catch { /* noop */ }
      const permanent = isPermanent(itemsErr);
      await updateOfflineSale(sale.id, {
        status: permanent ? "needs_attention" : "failed",
        last_error: itemsErr.message,
        last_error_code: itemsErr.code ?? null,
        next_retry_at: permanent ? null : scheduleBackoff(sale.attempts + 1),
        updated_at: new Date().toISOString(),
      });
      throw itemsErr;
    }
  }

  await updateOfflineSale(sale.id, {
    status: "synced",
    server_id: finalSale?.id ?? sale.id,
    server_receipt_number: finalSale?.receipt_number ?? null,
    last_error: null,
    last_error_code: null,
    next_retry_at: null,
    updated_at: new Date().toISOString(),
  });
}

async function syncCashMovement(m: OfflineCashMovement): Promise<void> {
  await updateOfflineCashMovement(m.id, { status: "syncing", attempts: m.attempts + 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from as any)("cash_movements").insert({
    id: m.id,
    store_id: m.store_id,
    register_session_id: m.register_session_id,
    user_id: m.user_id,
    type: m.type,
    amount: m.amount,
    reason: m.reason,
    notes: m.notes,
    idempotency_key: m.idempotency_key,
  });
  const dup = error?.code === "23505";
  if (error && !dup) {
    const permanent = isPermanent(error);
    await updateOfflineCashMovement(m.id, {
      status: permanent ? "needs_attention" : "failed",
      last_error: error.message,
    });
    throw error;
  }
  await updateOfflineCashMovement(m.id, { status: "synced", last_error: null });
}

export async function syncNow(): Promise<{ synced: number; failed: number; skipped?: string }> {
  if (syncing) return { synced: 0, failed: 0, skipped: "already-running" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0, skipped: "offline" };
  }
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    // Verify authenticated session — never sync without one. This prevents
    // the shell from posting queued sales as an anonymous user after a
    // sign-out or session expiry.
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      return { synced: 0, failed: 0, skipped: "no-session" };
    }

    // Recover any records the previous run left mid-flight.
    await recoverStaleSyncing();

    const pendingSales = await getPendingSales();
    const pendingCash = await getPendingCashMovements();
    emitSync({ type: "start", pending: pendingSales.length + pendingCash.length });

    // Sales first, oldest first (getPendingSales already sorts by local_seq).
    for (const s of pendingSales) {
      try { await syncSale(s); synced++; }
      catch (e) { failed++; console.warn("[sync] sale failed", e); }
      emitSync({ type: "progress" });
    }
    for (const m of pendingCash) {
      try { await syncCashMovement(m); synced++; }
      catch (e) { failed++; console.warn("[sync] cash movement failed", e); }
      emitSync({ type: "progress" });
    }
    lastSync = new Date().toISOString();
    emitSync({ type: "done" });
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

/* Attach global listeners once. */
let installed = false;
export function installAutoSync() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Recover stale records as soon as the module boots, even before the
  // first online transition.
  void recoverStaleSyncing().catch(() => {});
  window.addEventListener("online", () => { void syncNow(); });
  // Retry on interval as a safety net — the backoff gate inside
  // getPendingSales prevents this from hammering a failing endpoint.
  setInterval(() => {
    if (navigator.onLine) void syncNow();
  }, 30_000);
  // Kick immediately in case we came back with pending.
  setTimeout(() => { if (navigator.onLine) void syncNow(); }, 1500);
}

export async function pendingCounts() {
  const all = await getAllOfflineSales();
  const cash = await getPendingCashMovements();
  return {
    pendingSales: all.filter((s) => s.status === "pending" || s.status === "failed").length,
    syncingSales: all.filter((s) => s.status === "syncing").length,
    syncedSales: all.filter((s) => s.status === "synced").length,
    failedSales: all.filter((s) => s.status === "failed").length,
    needsAttentionSales: all.filter((s) => s.status === "needs_attention" || s.status === "conflict").length,
    unsyncedSales: all.filter((s) => s.status !== "synced").length,
    pendingCash: cash.length,
    lastSync,
  };
}
