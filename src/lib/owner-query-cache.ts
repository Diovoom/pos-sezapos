import type { QueryClient, QueryKey } from "@tanstack/react-query";

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 15 * 60_000;
const ALLOWED_ROOT_KEYS = new Set([
  "store",
  "categories",
  "inventory-products",
  "products",
  "dashboard-summary",
  "dashboard-detail",
  "employees",
  "sales",
  "recent-sales",
  "owner-support-unread",
]);

type CachedQuery = {
  key: QueryKey;
  data: unknown;
  updatedAt: number;
};

type CacheEnvelope = {
  version: number;
  savedAt: number;
  queries: CachedQuery[];
};

function storageKey(userId: string) {
  return `seza:owner-cache:v${CACHE_VERSION}:${userId}`;
}

function isAllowed(key: QueryKey) {
  const root = Array.isArray(key) ? key[0] : key;
  return typeof root === "string" && ALLOWED_ROOT_KEYS.has(root);
}

export function restoreOwnerQueryCache(queryClient: QueryClient, userId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    if (!raw) return;
    const cached = JSON.parse(raw) as CacheEnvelope;
    if (cached.version !== CACHE_VERSION || Date.now() - cached.savedAt > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(storageKey(userId));
      return;
    }
    for (const query of cached.queries) {
      if (!isAllowed(query.key)) continue;
      queryClient.setQueryData(query.key, query.data, { updatedAt: query.updatedAt });
    }
  } catch {
    // A broken cache must never block the dashboard.
  }
}

export function persistOwnerQueryCache(queryClient: QueryClient, userId: string) {
  if (typeof window === "undefined") return () => undefined;
  let timer: number | undefined;
  const save = () => {
    timer = undefined;
    try {
      const queries = queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.status === "success" && isAllowed(query.queryKey))
        .map((query) => ({
          key: query.queryKey,
          data: query.state.data,
          updatedAt: query.state.dataUpdatedAt,
        }));
      const envelope: CacheEnvelope = { version: CACHE_VERSION, savedAt: Date.now(), queries };
      window.sessionStorage.setItem(storageKey(userId), JSON.stringify(envelope));
    } catch {
      // Quota/private-mode failures are harmless; React Query still caches in memory.
    }
  };
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(save, 250);
  });
  return () => {
    if (timer) window.clearTimeout(timer);
    unsubscribe();
  };
}

export function clearOwnerQueryCache(userId?: string) {
  if (typeof window === "undefined") return;
  if (userId) {
    window.sessionStorage.removeItem(storageKey(userId));
    return;
  }
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith("seza:owner-cache:")) window.sessionStorage.removeItem(key);
  }
}
