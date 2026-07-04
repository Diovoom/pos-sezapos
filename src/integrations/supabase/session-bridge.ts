// Single-domain mode. The cross-subdomain session bridge has been removed;
// Supabase's default localStorage session persistence handles auth on one
// origin. These exports are retained as no-ops so existing imports compile.

export function hydrateSessionFromCookie(): Promise<void> {
  return Promise.resolve();
}

export function installSessionBridge(): void {
  // no-op
}
