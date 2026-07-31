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
  const merged: InventoryDraft = previous
    ? {
        ...previous,
        ...draft,
        original: previous.original ?? draft.original,
        createdAt: previous.createdAt,
        changes: { ...(previous.changes ?? {}), ...(draft.changes ?? {}) },
      }
    : draft;
  const next = existing.filter((item) => item.productId !== draft.productId);
  localStorage.setItem(draftKey(storeId), JSON.stringify([...next, merged]));
  window.dispatchEvent(new CustomEvent("inventory-drafts-change"));
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
