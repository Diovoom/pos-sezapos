// The Admin client uses a separate auth store; merchant auth events cannot
// clear it. A mounted Admin layout must observe its own session expiration.
export function watchAdminSession(auth: any, userId: string, invalidate: () => void) {
  let active = true;
  let invalidated = false;
  const { data } = auth.onAuthStateChange((event: string, session: any) => {
    if (!active || invalidated) return;
    if (event === "SIGNED_OUT" || session?.user?.id !== userId) {
      invalidated = true;
      // Leave Supabase's auth callback before navigation starts auth requests.
      queueMicrotask(() => { if (active) invalidate(); });
    }
  });
  return () => { active = false; data.subscription.unsubscribe(); };
}
