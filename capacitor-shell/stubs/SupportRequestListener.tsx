// Shell stub for the production SupportRequestListener.
//
// The real listener subscribes to admin_support_sessions realtime + calls
// TanStack Start server functions to accept/decline platform-admin support
// requests. That flow requires the server-fn plugin and is not yet wired
// into the bundled Android app. Shipping the real component would pull in
// server-fn transforms that don't exist in this Vite build.
//
// For now the Android POS ignores platform support requests silently.
// Merchants can still accept them in the web dashboard.
export function SupportRequestListener() {
  return null;
}
