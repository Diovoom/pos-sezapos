// Merchant context is safe configuration, never a Stripe connection token.
// All UI, heartbeat and reconnect callers share one read per authenticated scope.
export function createTerminalContextReads<T>(now = Date.now) {
  let scope = "";
  let generation = 0;
  let pending: Promise<T> | null = null;
  let cached: { value: T; expires: number } | null = null;
  let failure: { error: unknown; expires: number } | null = null;
  const invalidate = () => { generation++; pending = null; cached = null; failure = null; };
  return {
    invalidate,
    read(key: string, fetcher: () => Promise<T>, fresh = false): Promise<T> {
      if (key !== scope) { invalidate(); scope = key; }
      if (pending) return pending;
      if (failure && failure.expires > now()) return Promise.reject(failure.error);
      if (!fresh && cached && cached.expires > now()) return Promise.resolve(cached.value);
      const version = generation;
      const request = fetcher().then(value => {
        if (version === generation) { cached = { value, expires: now() + 10_000 }; failure = null; }
        return value;
      }).catch(error => {
        if (version === generation) {
          const retry = Number(error?.retryAfterSeconds);
          // Share failures too: independent pollers must respect Retry-After.
          failure = { error, expires: now() + (Number.isFinite(retry) ? Math.max(1, Math.min(300, retry)) * 1000 : 5_000) };
        }
        throw error;
      }).finally(() => { if (version === generation) pending = null; });
      pending = request;
      return request;
    },
  };
}
