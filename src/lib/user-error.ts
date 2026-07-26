const TECHNICAL_ERROR_PATTERN =
  /(?:\b(?:postgres|supabase|postgrest|sqlstate|constraint|rls|jwt|uuid|stack|trace)\b|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|https?:\/\/|\b(?:PGRST|2350\d|42501)\b)/i;

/** Convert internal/API errors into stable customer-facing POS messages. */
export function userFacingError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 180 || TECHNICAL_ERROR_PATTERN.test(clean)) return fallback;
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(clean)) {
    return "Connection lost. Check the internet connection and try again.";
  }
  if (/unauthorized|not authenticated|session.*expired/i.test(clean)) {
    return "Your session has expired. Sign in again to continue.";
  }
  return clean;
}
