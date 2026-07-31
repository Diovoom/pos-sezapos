export type InventoryDraft = {
  id: string;
  operation: "update" | "delete";
  productId: string;
  changes?: Record<string, unknown>;
  createdAt: string;
};

function key(storeId: string) { return `seza.inventory.drafts:${storeId}`; }
export function loadInventoryDrafts(storeId: string): InventoryDraft[] {
  try { return JSON.parse(localStorage.getItem(key(storeId)) ?? "[]") as InventoryDraft[]; }
  catch { return []; }
}
export function saveInventoryDraft(storeId: string, draft: InventoryDraft) {
  const existing = loadInventoryDrafts(storeId).filter((d) => d.productId !== draft.productId);
  localStorage.setItem(key(storeId), JSON.stringify([...existing, draft]));
  window.dispatchEvent(new CustomEvent("inventory-drafts-change"));
}
export function clearInventoryDrafts(storeId: string) {
  localStorage.removeItem(key(storeId));
  window.dispatchEvent(new CustomEvent("inventory-drafts-change"));
}
export function applyInventoryDrafts<T extends { id: string }>(rows: T[], drafts: InventoryDraft[]): T[] {
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const d of drafts) {
    if (d.operation === "delete") map.delete(d.productId);
    else {
      const row = map.get(d.productId);
      if (row) map.set(d.productId, { ...row, ...(d.changes ?? {}) });
    }
  }
  return [...map.values()];
}
