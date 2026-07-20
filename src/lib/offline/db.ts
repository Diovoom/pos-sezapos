// IndexedDB store for offline cash sales, cash movements, product cache,
// and audit-event queue. Never store PINs, passwords, card details.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OfflineSaleStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict"
  | "needs_attention";

// Bumped whenever the offline payload shape changes so old records can be
// safely migrated / quarantined instead of silently dropped.
export const OFFLINE_PAYLOAD_VERSION = 2;

export type OfflineSaleItem = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type OfflineSale = {
  id: string;                  // local UUID = sale.id
  idempotency_key: string;     // dedupe key on server
  correlation_id?: string;     // per-record trace id for support
  payload_version?: number;    // matches OFFLINE_PAYLOAD_VERSION at creation
  store_id: string;
  register_session_id: string | null;
  cashier_id: string;
  device_id: string;
  local_seq: number;
  local_created_at: string;
  updated_at?: string;
  status: OfflineSaleStatus;
  attempts: number;
  last_attempt_at?: string | null;
  last_error?: string | null;
  last_error_code?: string | null;
  next_retry_at?: string | null;   // backoff gate
  server_receipt_number?: number | null;
  server_id?: string | null;
  // snapshot
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amount_tendered: number;
  change_due: number;
  currency: string;
  items: OfflineSaleItem[];
  customer_name?: string | null;
};

export type OfflineCashMovement = {
  id: string;
  idempotency_key: string;
  store_id: string;
  register_session_id: string | null;
  user_id: string;
  type: "cash_in" | "cash_out" | "no_sale" | "safe_drop" | "deposit" | "payout";
  amount: number;
  reason?: string | null;
  notes?: string | null;
  local_created_at: string;
  status: OfflineSaleStatus;
  attempts: number;
  last_error?: string | null;
};

export type CachedProduct = {
  id: string;
  name: string;
  price: number;
  cost: number;
  sku: string | null;
  barcode: string | null;
  stock: number;
  taxable: boolean;
  category_id: string | null;
  is_favorite: boolean;
  store_id: string | null;
  image_url: string | null;
  age_restricted?: boolean | null;
  min_age?: number | null;
  age_category?: string | null;
};

interface SezaOfflineDB extends DBSchema {
  sales: { key: string; value: OfflineSale; indexes: { by_status: string; by_seq: number } };
  cash_movements: { key: string; value: OfflineCashMovement; indexes: { by_status: string } };
  products: { key: string; value: CachedProduct };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<SezaOfflineDB>> | null = null;

export function getDB() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<SezaOfflineDB>("seza-pos-offline", 1, {
      upgrade(db) {
        const s = db.createObjectStore("sales", { keyPath: "id" });
        s.createIndex("by_status", "status");
        s.createIndex("by_seq", "local_seq");
        const c = db.createObjectStore("cash_movements", { keyPath: "id" });
        c.createIndex("by_status", "status");
        db.createObjectStore("products", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

/* ---------- device id ---------- */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem("seza.device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("seza.device_id", id);
  }
  return id;
}

/* ---------- sequence ---------- */
export async function nextSeq(): Promise<number> {
  const db = await getDB();
  const cur = ((await db.get("meta", "seq")) as number | undefined) ?? 0;
  const next = cur + 1;
  await db.put("meta", next, "seq");
  return next;
}

/* ---------- product cache ---------- */
export async function cacheProducts(products: CachedProduct[]) {
  const db = await getDB();
  const tx = db.transaction("products", "readwrite");
  await tx.store.clear();
  for (const p of products) await tx.store.put(p);
  await tx.done;
  await db.put("meta", new Date().toISOString(), "products_cached_at");
}

export async function loadCachedProducts(): Promise<CachedProduct[]> {
  const db = await getDB();
  return (await db.getAll("products")) as CachedProduct[];
}

export async function cacheMeta(key: string, value: unknown) {
  const db = await getDB();
  await db.put("meta", value, key);
}

export async function readMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get("meta", key)) as T | undefined;
}

/* ---------- sales queue ---------- */
export async function saveOfflineSale(sale: OfflineSale) {
  const db = await getDB();
  await db.put("sales", sale);
}
export async function updateOfflineSale(id: string, patch: Partial<OfflineSale>) {
  const db = await getDB();
  const existing = await db.get("sales", id);
  if (!existing) return;
  await db.put("sales", { ...existing, ...patch });
}
export async function getAllOfflineSales(): Promise<OfflineSale[]> {
  const db = await getDB();
  const all = (await db.getAll("sales")) as OfflineSale[];
  return all.sort((a, b) => a.local_seq - b.local_seq);
}
export async function getPendingSales(): Promise<OfflineSale[]> {
  const all = await getAllOfflineSales();
  const now = Date.now();
  return all.filter((s) => {
    if (s.status !== "pending" && s.status !== "failed") return false;
    // Respect exponential backoff gate.
    if (s.next_retry_at && new Date(s.next_retry_at).getTime() > now) return false;
    return true;
  });
}

/**
 * Records marked "needs_attention" are surfaced to the operator via the
 * Pending Sync screen and require explicit action (retry / support).
 */
export async function getNeedsAttentionSales(): Promise<OfflineSale[]> {
  const all = await getAllOfflineSales();
  return all.filter((s) => s.status === "needs_attention" || s.status === "conflict");
}

/** True when there is any offline sale that has not been server-confirmed. */
export async function hasUnsyncedOfflineSales(shiftId?: string | null): Promise<boolean> {
  const all = await getAllOfflineSales();
  return all.some((s) => {
    if (s.status === "synced") return false;
    if (shiftId != null && s.register_session_id !== shiftId) return false;
    return true;
  });
}

/**
 * Recover records left in "syncing" from a crash / process kill / hard
 * network loss. Called at startup so no record is stranded indefinitely.
 */
export async function recoverStaleSyncing(): Promise<number> {
  const db = await getDB();
  let n = 0;
  const sales = (await db.getAll("sales")) as OfflineSale[];
  for (const s of sales) {
    if (s.status === "syncing") {
      await db.put("sales", { ...s, status: "pending", last_error: "recovered_stale_syncing" });
      n++;
    }
  }
  const cash = (await db.getAll("cash_movements")) as OfflineCashMovement[];
  for (const m of cash) {
    if (m.status === "syncing") {
      await db.put("cash_movements", { ...m, status: "pending", last_error: "recovered_stale_syncing" });
      n++;
    }
  }
  return n;
}

/* ---------- cash movements queue ---------- */
export async function saveOfflineCashMovement(m: OfflineCashMovement) {
  const db = await getDB();
  await db.put("cash_movements", m);
}
export async function updateOfflineCashMovement(id: string, patch: Partial<OfflineCashMovement>) {
  const db = await getDB();
  const existing = await db.get("cash_movements", id);
  if (!existing) return;
  await db.put("cash_movements", { ...existing, ...patch });
}
export async function getPendingCashMovements(): Promise<OfflineCashMovement[]> {
  const db = await getDB();
  const all = (await db.getAll("cash_movements")) as OfflineCashMovement[];
  return all.filter((m) => m.status === "pending" || m.status === "failed");
}

/* ---------- purge on store switch (safety) ---------- */
export async function purgeIfStoreChanged(storeId: string | null | undefined) {
  if (!storeId) return;
  const prev = await readMeta<string>("store_id");
  if (prev && prev !== storeId) {
    const db = await getDB();
    await Promise.all([
      db.clear("products"),
      db.clear("sales"),
      db.clear("cash_movements"),
    ]);
  }
  await cacheMeta("store_id", storeId);
}
