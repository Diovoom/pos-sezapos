// IndexedDB store for offline cash sales, cash movements, product cache,
// and audit-event queue. Never store PINs, passwords, card details.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OfflineSaleStatus =
  "pending" | "syncing" | "synced" | "failed" | "conflict" | "needs_attention";

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

/**
 * Create a stable numeric customer receipt number while the register is
 * offline. Format: YYMMDD + 3-digit device hash + 4-digit local sequence.
 * The original record keeps this number after cloud sync so refunds and
 * reprints can find the sale using the number printed for the customer.
 */
export function createLocalReceiptNumber(
  seq: number,
  deviceId: string,
  when: Date = new Date(),
): string {
  let hash = 0;
  for (const ch of deviceId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");
  const device = String(Math.abs(hash) % 1000).padStart(3, "0");
  const local = String(Math.abs(seq) % 10000).padStart(4, "0");
  return `${yy}${mm}${dd}${device}${local}`;
}

export type OfflineSale = {
  id: string; // local UUID = sale.id
  idempotency_key: string; // dedupe key on server
  correlation_id?: string; // per-record trace id for support
  payload_version?: number; // matches OFFLINE_PAYLOAD_VERSION at creation
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
  next_retry_at?: string | null; // backoff gate
  // Stable customer-facing number issued locally before cloud sync. It is
  // intentionally separate from the server sequence so the customer never
  // sees implementation words such as "offline" or "pending".
  local_receipt_number?: string | null;
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
  last_error_code?: string | null;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
};

export type OfflineActionKind =
  | "timeclock"
  | "register_open"
  | "register_close"
  | "audit_event"
  | "receipt_email"
  | "receipt_sms"
  | "catalog_mutation"
  | "employee_create";

export type OfflineAction = {
  id: string;
  idempotency_key: string;
  kind: OfflineActionKind;
  store_id: string | null;
  user_id: string;
  payload: Record<string, unknown>;
  local_created_at: string;
  status: OfflineSaleStatus;
  attempts: number;
  last_error?: string | null;
  next_retry_at?: string | null;
};

export type CachedEmployee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  status: string;
  hire_date: string | null;
  must_change_password: boolean;
  photo_url: string | null;
  pending_sync?: boolean;
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
  status?: string | null;
};

interface SezaOfflineDB extends DBSchema {
  sales: { key: string; value: OfflineSale; indexes: { by_status: string; by_seq: number } };
  cash_movements: { key: string; value: OfflineCashMovement; indexes: { by_status: string } };
  products: { key: string; value: CachedProduct };
  employees: { key: string; value: CachedEmployee };
  actions: { key: string; value: OfflineAction; indexes: { by_status: string; by_kind: string } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<SezaOfflineDB>> | null = null;

export function getDB() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<SezaOfflineDB>("seza-pos-offline", 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sales")) {
          const sales = db.createObjectStore("sales", { keyPath: "id" });
          sales.createIndex("by_status", "status");
          sales.createIndex("by_seq", "local_seq");
        }
        if (!db.objectStoreNames.contains("cash_movements")) {
          const cash = db.createObjectStore("cash_movements", { keyPath: "id" });
          cash.createIndex("by_status", "status");
        }
        if (!db.objectStoreNames.contains("products"))
          db.createObjectStore("products", { keyPath: "id" });
        if (!db.objectStoreNames.contains("employees"))
          db.createObjectStore("employees", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("actions")) {
          const actions = db.createObjectStore("actions", { keyPath: "id" });
          actions.createIndex("by_status", "status");
          actions.createIndex("by_kind", "kind");
        }
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
  // Use one read/write transaction so two rapid checkouts cannot receive the
  // same local receipt sequence. IndexedDB serializes read/write transactions
  // against the same object store.
  const tx = db.transaction("meta", "readwrite");
  const cur = ((await tx.store.get("seq")) as number | undefined) ?? 0;
  const next = cur + 1;
  await tx.store.put(next, "seq");
  await tx.done;
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

export async function upsertCachedProduct(product: CachedProduct) {
  const db = await getDB();
  await db.put("products", product);
  await db.put("meta", new Date().toISOString(), "products_cached_at");
}

export async function deleteCachedProduct(productId: string) {
  const db = await getDB();
  await db.delete("products", productId);
  await db.put("meta", new Date().toISOString(), "products_cached_at");
}

/* ---------- employee cache ---------- */
export async function cacheEmployees(employees: CachedEmployee[]) {
  const db = await getDB();
  const tx = db.transaction("employees", "readwrite");
  await tx.store.clear();
  for (const employee of employees) await tx.store.put(employee);
  await tx.done;
  await db.put("meta", new Date().toISOString(), "employees_cached_at");
}

export async function loadCachedEmployees(): Promise<CachedEmployee[]> {
  const db = await getDB();
  return (await db.getAll("employees")) as CachedEmployee[];
}

export async function upsertCachedEmployee(employee: CachedEmployee) {
  const db = await getDB();
  await db.put("employees", employee);
  await db.put("meta", new Date().toISOString(), "employees_cached_at");
}

export async function deleteCachedEmployee(employeeId: string) {
  const db = await getDB();
  await db.delete("employees", employeeId);
}

export async function cacheMeta(key: string, value: unknown) {
  const db = await getDB();
  await db.put("meta", value, key);
}

export async function readMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get("meta", key)) as T | undefined;
}

export async function deleteMeta(key: string) {
  const db = await getDB();
  await db.delete("meta", key);
}

/** Employee-scoped local state prevents one cashier from inheriting another
 * employee's cart, clock, or register state on a shared POS terminal. */
export function employeeMetaKey(base: string, userId?: string | null): string {
  return userId ? `${base}:${userId}` : base;
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
      await db.put("cash_movements", {
        ...m,
        status: "pending",
        last_error: "recovered_stale_syncing",
      });
      n++;
    }
  }
  const actions = (await db.getAll("actions")) as OfflineAction[];
  for (const action of actions) {
    if (action.status === "syncing") {
      await db.put("actions", {
        ...action,
        status: "pending",
        last_error: "recovered_stale_syncing",
      });
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
export async function getAllOfflineCashMovements(): Promise<OfflineCashMovement[]> {
  const db = await getDB();
  return (await db.getAll("cash_movements")) as OfflineCashMovement[];
}

export async function getPendingCashMovements(): Promise<OfflineCashMovement[]> {
  const all = await getAllOfflineCashMovements();
  const now = Date.now();
  return all.filter((m) => {
    if (m.status !== "pending" && m.status !== "failed") return false;
    return !m.next_retry_at || new Date(m.next_retry_at).getTime() <= now;
  });
}

/* ---------- generic offline action queue ---------- */
export async function saveOfflineAction(action: OfflineAction) {
  const db = await getDB();
  await db.put("actions", action);
}
export async function updateOfflineAction(id: string, patch: Partial<OfflineAction>) {
  const db = await getDB();
  const existing = await db.get("actions", id);
  if (!existing) return;
  await db.put("actions", { ...existing, ...patch });
}
export async function getAllOfflineActions(): Promise<OfflineAction[]> {
  const db = await getDB();
  const actions = (await db.getAll("actions")) as OfflineAction[];
  return actions.sort((a, b) => a.local_created_at.localeCompare(b.local_created_at));
}
export async function getPendingOfflineActions(): Promise<OfflineAction[]> {
  const now = Date.now();
  const actions = await getAllOfflineActions();
  return actions.filter((action) => {
    if (action.status !== "pending" && action.status !== "failed") return false;
    return !action.next_retry_at || new Date(action.next_retry_at).getTime() <= now;
  });
}

export type StoreSwitchConflict = {
  previousStoreId: string;
  requestedStoreId: string;
  preservedUnsyncedRecords: number;
  detectedAt: string;
};

export type StoreChangeResult = {
  changed: boolean;
  blocked: boolean;
  previousStoreId: string | null;
  requestedStoreId: string | null;
  preservedUnsyncedRecords: number;
};

/** Count all local financial records that are not server-confirmed. */
export async function countUnsyncedFinancialRecords(): Promise<number> {
  const [sales, cash, actions] = await Promise.all([
    getAllOfflineSales(),
    getAllOfflineCashMovements(),
    getAllOfflineActions(),
  ]);
  return (
    sales.filter((row) => row.status !== "synced").length +
    cash.filter((row) => row.status !== "synced").length +
    actions.filter((row) => row.status !== "synced").length
  );
}

/* ---------- cache isolation on store switch (safety) ---------- */
export async function purgeIfStoreChanged(
  storeId: string | null | undefined,
): Promise<StoreChangeResult> {
  if (!storeId) {
    return {
      changed: false,
      blocked: false,
      previousStoreId: null,
      requestedStoreId: null,
      preservedUnsyncedRecords: 0,
    };
  }
  const prev = await readMeta<string>("store_id");
  if (prev && prev !== storeId) {
    const db = await getDB();
    // Products are a disposable cache. Financial queues are not. Previous
    // versions erased pending sales, drawer movements, and shift actions here,
    // which could permanently lose money records during re-pairing.
    await db.clear("products");
    const preservedUnsyncedRecords = await countUnsyncedFinancialRecords();
    if (preservedUnsyncedRecords > 0) {
      // Never silently reassign a terminal while financial records from its
      // previous store are still awaiting server confirmation. Keep the old
      // store binding and surface a hard safety block until support/recovery.
      const conflict: StoreSwitchConflict = {
        previousStoreId: prev,
        requestedStoreId: storeId,
        preservedUnsyncedRecords,
        detectedAt: new Date().toISOString(),
      };
      await cacheMeta("store_switch_conflict", conflict);
      return {
        changed: true,
        blocked: true,
        previousStoreId: prev,
        requestedStoreId: storeId,
        preservedUnsyncedRecords,
      };
    }
    await cacheMeta("store_id", storeId);
    await cacheMeta("store_switch_conflict", null);
    return {
      changed: true,
      blocked: false,
      previousStoreId: prev,
      requestedStoreId: storeId,
      preservedUnsyncedRecords: 0,
    };
  }
  await cacheMeta("store_id", storeId);
  await cacheMeta("store_switch_conflict", null);
  return {
    changed: false,
    blocked: false,
    previousStoreId: prev ?? null,
    requestedStoreId: storeId,
    preservedUnsyncedRecords: 0,
  };
}
