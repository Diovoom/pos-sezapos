export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof console !== "undefined") {
    console.error("SEZA application error", { error, route: typeof window !== "undefined" ? window.location.pathname : undefined, ...context });
  }
}
