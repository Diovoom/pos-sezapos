import {
  deleteCachedProduct,
  saveOfflineAction,
  upsertCachedProduct,
  type CachedProduct,
} from "@/lib/offline/db";

export type InventoryDraftOperation = "create" | "update" | "delete";

export type InventoryDraft = {
  id: string;
  operation: InventoryDraftOperation;
  productId: string;
  changes?: Record<string, unknown>;
  original?: Record<string, unknown> | null;
  createdAt: string;
};

export type CatalogPublishHistory = {
  id: string;
  version: number;
  publishedAt: string;
  changeCount: number;
  summary: { created: number; updated: number; deleted: number };
  rollbackDrafts: InventoryDraft[];
};

function draftKey(storeId: string) { return `seza.inventory.drafts:${storeId}`; }
function historyKey(storeId: string) { return `seza.inventory.publish-history:${storeId}`; }
function versionKey(storeId: string) { return `seza.inventory.catalog-version:${storeId}`; }

export function loadInventoryDrafts(storeId: string): InventoryDraft[] {
  try { return JSON.parse(localStorage.getItem(draftKey(storeId)) ?? "[]") as InventoryDraft[]; }
  catch { return []; }
}

export function saveInventoryDraft(storeId: string, draft: InventoryDraft) {
  const existing = loadInventoryDrafts(storeId);
  const previous = existing.find((item) => item.productId === draft.productId);
  const mergedOperation: InventoryDraftOperation = previous
    ? previous.operation === "create" && draft.operation !== "delete"
      ? "create"
      : previous.operation === "create" && draft.operation === "delete"
        ? "delete"
        : draft.operation
    : draft.operation;
  const merged: InventoryDraft = previous
    ? {
        ...previous,
        ...draft,
        operation: mergedOperation,
        original: previous.original ?? draft.original,
        createdAt: previous.createdAt,
        changes: { ...(previous.changes ?? {}), ...(draft.changes ?? {}) },
      }
    : draft;
  const next = existing.filter((item) => item.productId !== draft.productId);
  localStorage.setItem(draftKey(storeId), JSON.stringify([...next, merged]));
  window.dispatchEvent(new CustomEvent("inventory-drafts-change"));

  // Local-first catalog: the register sees this mutation immediately and the
  // durable action queue pushes it to the cloud automatically when a valid
  // connection + authenticated session are available. One deterministic queue
  // row per product means repeated edits collapse into the newest state rather
  // than replaying stale intermediate versions.
  const base = { ...(merged.original ?? {}), ...(merged.changes ?? {}) } as Record<string, unknown>;
  if (merged.operation === "delete") {
    void deleteCachedProduct(merged.productId).catch(() => {});
  } else {
    const cached: CachedProduct = {
      id: merged.productId,
      name: String(base.name ?? "Unnamed product"),
      price: Number(base.price ?? 0),
      cost: Number(base.cost ?? 0),
      sku: base.sku == null ? null : String(base.sku),
      barcode: base.barcode == null ? null : String(base.barcode),
      stock: Number(base.stock ?? 0),
      taxable: base.taxable !== false,
      category_id: base.category_id == null ? null : String(base.category_id),
      is_favorite: Boolean(base.is_favorite),
      store_id: storeId,
      image_url: base.image_url == null ? null : String(base.image_url),
      age_restricted: Boolean(base.age_restricted),
      min_age: base.min_age == null ? null : Number(base.min_age),
      age_category: base.age_category == null ? null : String(base.age_category),
      status: base.status == null ? "active" : String(base.status),
    };
    void upsertCachedProduct(cached).catch(() => {});
  }

  void saveOfflineAction({
    id: `catalog:${storeId}:${merged.id}`,
    idempotency_key: `catalog:${storeId}:${merged.id}`,
    kind: "catalog_mutation",
    store_id: storeId,
    user_id: "local-first",
    payload: {
      operation: merged.operation,
      productId: merged.productId,
      draftId: merged.id,
      changes: merged.changes ?? {},
    },
    local_created_at: merged.createdAt,
    status: "pending",
    attempts: 0,
  }).then(() => {
    void import("@/lib/offline/sync").then(({ syncNow }) => syncNow().catch(() => {}));
  }).catch(() => {});
}

export function removeInventoryDraft(storeId: string, productId: string) {
  const next = loadInventoryDrafts(storeId).filter((item) => item.productId !== productId);
  localStorage.setItem(draftKey(storeId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("inventory-drafts-change"));
}

export function clearInventoryDrafts(storeId: string) {
  localStorage.removeItem(draftKey(storeId));
  window.dispatchEvent(new CustomEvent("inventory-drafts-change"));
}

export function applyInventoryDrafts<T extends { id: string }>(rows: T[], drafts: InventoryDraft[]): T[] {
  const map = new Map(rows.map((row) => [row.id, row]));
  for (const draft of drafts) {
    if (draft.operation === "delete") map.delete(draft.productId);
    else if (draft.operation === "create") {
      map.set(draft.productId, { id: draft.productId, ...(draft.changes ?? {}) } as T);
    } else {
      const row = map.get(draft.productId);
      if (row) map.set(draft.productId, { ...row, ...(draft.changes ?? {}) });
    }
  }
  return [...map.values()];
}

export function loadPublishHistory(storeId: string): CatalogPublishHistory[] {
  try { return JSON.parse(localStorage.getItem(historyKey(storeId)) ?? "[]") as CatalogPublishHistory[]; }
  catch { return []; }
}

export function recordPublish(storeId: string, drafts: InventoryDraft[]) {
  const version = Number(localStorage.getItem(versionKey(storeId)) ?? "0") + 1;
  localStorage.setItem(versionKey(storeId), String(version));
  const entry: CatalogPublishHistory = {
    id: crypto.randomUUID(),
    version,
    publishedAt: new Date().toISOString(),
    changeCount: drafts.length,
    summary: {
      created: drafts.filter((d) => d.operation === "create").length,
      updated: drafts.filter((d) => d.operation === "update").length,
      deleted: drafts.filter((d) => d.operation === "delete").length,
    },
    rollbackDrafts: drafts.map((draft) => ({
      id: crypto.randomUUID(),
      productId: draft.productId,
      operation: draft.operation === "create" ? "delete" : draft.operation === "delete" ? "create" : "update",
      changes: draft.original ?? {},
      original: draft.changes ?? null,
      createdAt: new Date().toISOString(),
    })),
  };
  const history = [entry, ...loadPublishHistory(storeId)].slice(0, 20);
  localStorage.setItem(historyKey(storeId), JSON.stringify(history));
  window.dispatchEvent(new CustomEvent("inventory-publish-history-change"));
  return entry;
}
