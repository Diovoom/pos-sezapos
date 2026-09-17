export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV || typeof console === "undefined") return;
  console.error("SEZA application error", {
    error,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    ...context,
  });
}
