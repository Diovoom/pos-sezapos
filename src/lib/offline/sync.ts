// Sync driver: drains offline queue to Supabase.
// Idempotency: sales.idempotency_key + cash_movements.idempotency_key are UNIQUE.
// A duplicate (23505) is treated as already-synced.
// RLS enforces store scoping — no server function needed for basic protection.
import { supabase } from "@/integrations/supabase/client";
import {
  getPendingSales,
  getPendingCashMovements,
  updateOfflineSale,
  updateOfflineCashMovement,
  getAllOfflineSales,
  type OfflineSale,
  type OfflineCashMovement,
} from "./db";
import { emitSync } from "./useOnline";

let syncing = false;
let lastSync: string | null = null;

export function getLastSync() { return lastSync; }

async function syncSale(sale: OfflineSale): Promise<void> {
  await updateOfflineSale(sale.id, { status: "syncing", attempts: sale.attempts + 1 });

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
    await updateOfflineSale(sale.id, { status: "failed", last_error: saleErr.message });
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
      await updateOfflineSale(sale.id, { status: "failed", last_error: itemsErr.message });
      throw itemsErr;
    }
  }

  await updateOfflineSale(sale.id, {
    status: "synced",
    server_id: finalSale?.id ?? sale.id,
    server_receipt_number: finalSale?.receipt_number ?? null,
    last_error: null,
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
    await updateOfflineCashMovement(m.id, { status: "failed", last_error: error.message });
    throw error;
  }
  await updateOfflineCashMovement(m.id, { status: "synced", last_error: null });
}

export async function syncNow(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    // Verify authenticated store (protection).
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return { synced: 0, failed: 0 };

    const pendingSales = await getPendingSales();
    const pendingCash = await getPendingCashMovements();
    emitSync({ type: "start", pending: pendingSales.length + pendingCash.length });

    // Sales first, in creation order.
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
  window.addEventListener("online", () => { void syncNow(); });
  // Retry on interval as a safety net.
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
    syncedSales: all.filter((s) => s.status === "synced").length,
    failedSales: all.filter((s) => s.status === "failed").length,
    pendingCash: cash.length,
    lastSync,
  };
}
