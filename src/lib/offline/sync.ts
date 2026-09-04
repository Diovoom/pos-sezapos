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
  getAllOfflineCashMovements,
  updateOfflineSale,
  updateOfflineCashMovement,
  getAllOfflineSales,
  recoverStaleSyncing,
  getPendingOfflineActions,
  updateOfflineAction,
  getAllOfflineActions,
  type OfflineSale,
  type OfflineCashMovement,
  type OfflineAction,
  cacheMeta,
  upsertCachedEmployee,
  deleteCachedEmployee,
} from "./db";
import { postTimeClockAction } from "@/lib/timeclock/client";
import { sendTransactionalEmail } from "@/lib/email/send";
import { sendSms } from "@/lib/sms/send";
import { emitSync } from "./useOnline";

let syncing = false;
let lastSync: string | null = null;

export function getLastSync() {
  return lastSync;
}

// PostgREST / Supabase error codes that will never succeed on retry.
// Anything else is treated as temporary and gets exponential backoff.
const PERMANENT_CODES = new Set<string>([
  "42501", // insufficient_privilege / RLS denial
  "PGRST301",
  "PGRST302",
  "PGRST116", // rls / row not found
  "PGRST202",
  "42883", // required RPC/function missing from deployed database
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
  const attempts = sale.attempts + 1;
  await updateOfflineSale(sale.id, {
    status: "syncing",
    attempts,
    last_attempt_at: nowIso,
    updated_at: nowIso,
    last_error: null,
    last_error_code: null,
  });

  const items = sale.items.map((line) => ({
    product_id: line.product_id,
    product_name: line.product_name,
    quantity: line.quantity,
    unit_price: line.unit_price,
    line_total: line.line_total,
  }));
  const payments = [
    {
      method: "cash",
      amount: sale.total,
      provider: null,
      provider_reference: null,
      status: "completed",
      metadata: { local_first: true, device_id: sale.device_id },
    },
  ];

  // One RPC = one PostgreSQL transaction. Header, items, payment ledger, and
  // inventory trigger effects either all commit or all roll back.

  const { data, error } = await (supabase.rpc as any)("finalize_pos_sale", {
    p_sale: {
      id: sale.id,
      store_id: sale.store_id,
      subtotal: sale.subtotal,
      tax: sale.tax,
      discount: sale.discount,
      total: sale.total,
      payment_method: "cash",
      amount_tendered: sale.amount_tendered,
      change_due: sale.change_due,
      register_session_id: sale.register_session_id,
      status: "completed",
      customer_name: sale.customer_name ?? null,
      idempotency_key: sale.idempotency_key,
      synced_from_offline: true,
      offline_created_at: sale.local_created_at,
    },
    p_items: items,
    p_payments: payments,
  });

  if (error) {
    const permanent = isPermanent(error);
    await updateOfflineSale(sale.id, {
      status: permanent || attempts >= 8 ? "needs_attention" : "failed",
      last_error: error.message,
      last_error_code: error.code ?? null,
      next_retry_at: permanent || attempts >= 8 ? null : scheduleBackoff(attempts),
      updated_at: new Date().toISOString(),
    });
    throw error;
  }

  const row = data as { id?: string; receipt_number?: number | null } | null;
  if (!row?.id) {
    const invalidResponse = new Error("Atomic sale sync returned no sale id");
    await updateOfflineSale(sale.id, {
      status: attempts >= 8 ? "needs_attention" : "failed",
      last_error: invalidResponse.message,
      next_retry_at: attempts >= 8 ? null : scheduleBackoff(attempts),
      updated_at: new Date().toISOString(),
    });
    throw invalidResponse;
  }

  await updateOfflineSale(sale.id, {
    status: "synced",
    server_id: row.id,
    server_receipt_number: row.receipt_number ?? null,
    last_error: null,
    last_error_code: null,
    next_retry_at: null,
    updated_at: new Date().toISOString(),
  });
}

async function syncCashMovement(m: OfflineCashMovement): Promise<void> {
  const attempts = m.attempts + 1;
  await updateOfflineCashMovement(m.id, {
    status: "syncing",
    attempts,
    last_attempt_at: new Date().toISOString(),
    last_error: null,
    last_error_code: null,
  });

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
      status: permanent || attempts >= 8 ? "needs_attention" : "failed",
      last_error: error.message,
      last_error_code: error.code ?? null,
      next_retry_at: permanent || attempts >= 8 ? null : scheduleBackoff(attempts),
    });
    throw error;
  }
  await updateOfflineCashMovement(m.id, {
    status: "synced",
    last_error: null,
    last_error_code: null,
    next_retry_at: null,
  });
}

async function syncAction(action: OfflineAction): Promise<void> {
  const attempts = action.attempts + 1;
  await updateOfflineAction(action.id, { status: "syncing", attempts, last_error: null });
  try {
    if (action.kind === "timeclock") {
      const clockAction = String(action.payload.action) as
        "clock_in" | "clock_out" | "start_break" | "end_break";
      const result = await postTimeClockAction({
        action: clockAction,
        occurredAt: String(action.payload.occurredAt ?? action.local_created_at),
        idempotencyKey: action.idempotency_key,
      });

      // Replace the temporary local-time-* entry with the canonical server
      // row after sync. This prevents a later render from bouncing between
      // local and cloud clock state.
      if (action.user_id) {
        await cacheMeta(
          `timeclock_open:${action.user_id}`,
          clockAction === "clock_out" ? null : (result.entry ?? null),
        );
      }
    } else if (action.kind === "register_open") {
      const row = action.payload;

      const { error } = await (supabase.from as any)("register_sessions").upsert(
        {
          id: row.id,
          store_id: action.store_id,
          opened_by: action.user_id,
          opened_at: row.opened_at ?? action.local_created_at,
          opening_cash: row.opening_cash ?? 0,
          notes: row.notes ?? null,
          status: "open",
        },
        { onConflict: "id" },
      );
      if (error && error.code !== "23505") throw error;
    } else if (action.kind === "register_close") {
      const row = action.payload;

      const { error } = await (supabase.from as any)("register_sessions")
        .update({
          status: "closed",
          closed_at: row.closed_at ?? action.local_created_at,
          closed_by: action.user_id,
          closing_cash: row.closing_cash,
          expected_cash: row.expected_cash,
          variance: row.variance,
          safe_drop_amount: row.safe_drop_amount ?? 0,
          close_notes: row.close_notes ?? null,
        })
        .eq("id", row.id);
      if (error) throw error;
    } else if (action.kind === "audit_event") {
      // The queued row has a client-generated UUID, making retries
      // idempotent even if the first response was lost after commit.

      const { error } = await (supabase.from as any)("audit_log").insert(action.payload);
      if (error && error.code !== "23505") throw error;
    } else if (action.kind === "receipt_email") {
      const result = await sendTransactionalEmail(action.payload as any, {
        queueOnNetworkFailure: false,
      });
      if (!result.ok) throw new Error(result.error);
    } else if (action.kind === "receipt_sms") {
      const result = await sendSms(action.payload as any, { queueOnNetworkFailure: false });
      if (!result.ok) throw new Error(result.error);
    } else if (action.kind === "catalog_mutation") {
      const operation = String(action.payload.operation ?? "");
      const productId = String(action.payload.productId ?? "");
      const changes = (action.payload.changes ?? {}) as Record<string, unknown>;
      if (!action.store_id || !productId) throw new Error("Invalid queued catalog mutation");

      if (operation === "create") {
        const { error } = await (supabase.from as any)("products").upsert(
          { id: productId, store_id: action.store_id, ...changes },
          { onConflict: "id" },
        );
        if (error) throw error;
      } else if (operation === "update") {
        const { error } = await (supabase.from as any)("products")
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq("id", productId)
          .eq("store_id", action.store_id);
        if (error) throw error;
      } else if (operation === "delete") {
        const { error } = await (supabase.from as any)("products")
          .delete()
          .eq("id", productId)
          .eq("store_id", action.store_id);
        if (error && error.code !== "23503") throw error;
      } else {
        throw new Error("Unknown catalog mutation operation");
      }

      // Drafts double as durable local-first catalog mutations. Once the
      // cloud confirms this exact product mutation, remove only that draft.
      const { loadInventoryDrafts, removeInventoryDraft } = await import("@/lib/inventory-drafts");
      const currentDraft = loadInventoryDrafts(action.store_id).find((draft) => draft.productId === productId);
      if (currentDraft && currentDraft.id === String(action.payload.draftId ?? "")) {
        removeInventoryDraft(action.store_id, productId);
      }
    } else if (action.kind === "employee_create") {
      // Creating a Supabase Auth identity is inherently a cloud operation.
      // The employee row is staged locally while offline, then provisioned
      // automatically the first time connectivity + the owner's auth session
      // are both available. Existing cached employees remain fully usable offline.
      const { createEmployee } = await import("@/lib/employees.functions");
      const payload = action.payload as {
        local_id?: string; first_name: string; last_name: string; email: string;
        phone?: string; role: "manager" | "cashier"; hire_date?: string;
      };
      const result = await createEmployee({
        data: {
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
          hire_date: payload.hire_date,
        },
      } as any);
      if (payload.local_id) await deleteCachedEmployee(payload.local_id);
      await upsertCachedEmployee({
        id: result.user_id,
        first_name: payload.first_name,
        last_name: payload.last_name,
        full_name: `${payload.first_name} ${payload.last_name}`.trim(),
        email: result.email,
        phone: payload.phone ?? null,
        employee_id: result.employee_id,
        status: "active",
        hire_date: payload.hire_date ?? null,
        must_change_password: true,
        photo_url: null,
        pending_sync: false,
      });
      // Preserve the one-time credential locally until the owner opens the
      // Employees page. It is never sent to analytics/logs or stored in source.
      const { cacheMeta } = await import("./db");
      await cacheMeta(`employee_provisioned:${action.id}`, {
        user_id: result.user_id,
        employee_id: result.employee_id,
        email: result.email,
        temp_password: result.temp_password,
        created_at: new Date().toISOString(),
      });
    }
    await updateOfflineAction(action.id, {
      status: "synced",
      last_error: null,
      next_retry_at: null,
    });
  } catch (error) {
    const normalized = error as { code?: string; message?: string; status?: number } | null;
    const message = error instanceof Error ? error.message : (normalized?.message ?? String(error));
    const permanent = isPermanent(normalized);
    await updateOfflineAction(action.id, {
      status: permanent || attempts >= 8 ? "needs_attention" : "failed",
      last_error: message,
      next_retry_at: permanent || attempts >= 8 ? null : scheduleBackoff(attempts),
    });
    throw error;
  }
}

export async function syncNow(): Promise<{ synced: number; failed: number; skipped?: string }> {
  if (syncing) return { synced: 0, failed: 0, skipped: "already-running" };
  const { isOnlineNow } = await import("./useOnline");
  if (!isOnlineNow()) {
    return { synced: 0, failed: 0, skipped: "offline" };
  }
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    // Verify authenticated session  -  never sync without one. This prevents
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
    const pendingActions = await getPendingOfflineActions();
    const allActions = await getAllOfflineActions();
    // Any locally-created register session that is not server-confirmed blocks
    // dependent sales/cash/close operations. Otherwise a temporary register
    // failure would turn valid sales into permanent foreign-key failures.
    const blockedSessionIds = new Set(
      allActions
        .filter((action) => action.kind === "register_open" && action.status !== "synced")
        .map((action) => String(action.payload.id ?? ""))
        .filter(Boolean),
    );
    emitSync({
      type: "start",
      pending: pendingSales.length + pendingCash.length + pendingActions.length,
    });

    // Dependency-safe drain order:
    // 1) create local register sessions before sales reference them;
    // 2) apply time-clock state;
    // 3) sync sales and drawer movements;
    // 4) deliver receipts only after their sale exists publicly;
    // 5) close the register last.
    const registerOpenActions = pendingActions.filter((action) => action.kind === "register_open");
    const timeClockActions = pendingActions.filter((action) => action.kind === "timeclock");
    const catalogUpserts = pendingActions.filter(
      (action) => action.kind === "catalog_mutation" && action.payload.operation !== "delete",
    );
    const catalogDeletes = pendingActions.filter(
      (action) => action.kind === "catalog_mutation" && action.payload.operation === "delete",
    );
    const employeeCreates = pendingActions.filter((action) => action.kind === "employee_create");
    const auditActions = pendingActions.filter((action) => action.kind === "audit_event");
    const receiptActions = pendingActions.filter(
      (action) => action.kind === "receipt_email" || action.kind === "receipt_sms",
    );
    const registerCloseActions = pendingActions.filter(
      (action) => action.kind === "register_close",
    );

    for (const action of registerOpenActions) {
      const sessionId = String(action.payload.id ?? "");
      try {
        await syncAction(action);
        if (sessionId) blockedSessionIds.delete(sessionId);
        synced++;
      } catch (e) {
        if (sessionId) blockedSessionIds.add(sessionId);
        failed++;
        console.warn("[sync] register open failed; dependent records deferred", e);
      }
      emitSync({ type: "progress" });
    }
    for (const action of timeClockActions) {
      try {
        await syncAction(action);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] time-clock action failed", e);
      }
      emitSync({ type: "progress" });
    }
    // Product creates/updates must reach the cloud before any queued sale can
    // reference a newly-created local product. Employee provisioning is also
    // safe to perform before financial records.
    for (const action of [...catalogUpserts, ...employeeCreates]) {
      try {
        await syncAction(action);
        synced++;
      } catch (e) {
        failed++;
        console.warn(`[sync] ${action.kind} failed`, e);
      }
      emitSync({ type: "progress" });
    }
    for (const sale of pendingSales) {
      if (sale.register_session_id && blockedSessionIds.has(sale.register_session_id)) {
        if (import.meta.env.DEV)
          console.info("[sync] sale deferred until local register session syncs", sale.id);
        emitSync({ type: "progress" });
        continue;
      }
      try {
        await syncSale(sale);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] sale failed", e);
      }
      emitSync({ type: "progress" });
    }
    for (const movement of pendingCash) {
      if (movement.register_session_id && blockedSessionIds.has(movement.register_session_id)) {
        if (import.meta.env.DEV)
          console.info(
            "[sync] cash movement deferred until local register session syncs",
            movement.id,
          );
        emitSync({ type: "progress" });
        continue;
      }
      try {
        await syncCashMovement(movement);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] cash movement failed", e);
      }
      emitSync({ type: "progress" });
    }
    for (const action of catalogDeletes) {
      try {
        await syncAction(action);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] catalog delete failed", e);
      }
      emitSync({ type: "progress" });
    }
    for (const action of auditActions) {
      try {
        await syncAction(action);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] audit action failed", e);
      }
      emitSync({ type: "progress" });
    }
    // Customer receipts for offline sales must wait until the referenced sale
    // has a server receipt. Email stores transactionId inside templateData;
    // SMS stores saleId directly.
    const currentSales = await getAllOfflineSales();
    for (const action of receiptActions) {
      const payload = action.payload;
      const templateData =
        payload.templateData && typeof payload.templateData === "object"
          ? (payload.templateData as Record<string, unknown>)
          : undefined;
      const referencedSaleId = String(payload.saleId ?? templateData?.transactionId ?? "");
      const localSale = referencedSaleId
        ? currentSales.find((sale) => sale.id === referencedSaleId)
        : undefined;
      if (localSale && localSale.status !== "synced") {
        if (import.meta.env.DEV)
          console.info("[sync] receipt deferred until sale syncs", action.id);
        emitSync({ type: "progress" });
        continue;
      }
      try {
        await syncAction(action);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] receipt action failed", e);
      }
      emitSync({ type: "progress" });
    }

    // Closing a shift before every associated sale and drawer movement is
    // confirmed would make later recovery/accounting ambiguous. Close last,
    // and leave the action pending while anything for that session remains.
    const currentCash = await getAllOfflineCashMovements();
    for (const action of registerCloseActions) {
      const sessionId = String(action.payload.id ?? "");
      const hasUnsyncedDependency =
        blockedSessionIds.has(sessionId) ||
        currentSales.some(
          (sale) => sale.register_session_id === sessionId && sale.status !== "synced",
        ) ||
        currentCash.some(
          (movement) => movement.register_session_id === sessionId && movement.status !== "synced",
        );
      if (hasUnsyncedDependency) {
        if (import.meta.env.DEV)
          console.info("[sync] register close deferred until shift records sync", sessionId);
        emitSync({ type: "progress" });
        continue;
      }
      try {
        await syncAction(action);
        synced++;
      } catch (e) {
        failed++;
        console.warn("[sync] register close failed", e);
      }
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
  window.addEventListener("online", () => {
    void syncNow();
  });
  // Retry on interval as a safety net  -  the backoff gate inside
  // getPendingSales prevents this from hammering a failing endpoint.
  setInterval(() => {
    void syncNow();
  }, 30_000);
  // Kick immediately in case we came back with pending.
  setTimeout(() => {
    void syncNow();
  }, 1500);
}

export async function pendingCounts() {
  const all = await getAllOfflineSales();
  const cash = await getAllOfflineCashMovements();
  const actions = await getAllOfflineActions();
  return {
    pendingSales: all.filter((s) => s.status === "pending" || s.status === "failed").length,
    syncingSales: all.filter((s) => s.status === "syncing").length,
    syncedSales: all.filter((s) => s.status === "synced").length,
    failedSales: all.filter((s) => s.status === "failed").length,
    needsAttentionSales: all.filter(
      (s) => s.status === "needs_attention" || s.status === "conflict",
    ).length,
    unsyncedSales: all.filter((s) => s.status !== "synced").length,
    pendingCash: cash.filter((m) => m.status === "pending" || m.status === "failed").length,
    needsAttentionCash: cash.filter(
      (m) => m.status === "needs_attention" || m.status === "conflict",
    ).length,
    unsyncedCash: cash.filter((m) => m.status !== "synced").length,
    pendingActions: actions.filter((a) => a.status === "pending" || a.status === "failed").length,
    needsAttentionActions: actions.filter(
      (a) => a.status === "needs_attention" || a.status === "conflict",
    ).length,
    lastSync,
  };
}
