const TECHNICAL_ERROR_PATTERN =
  /(?:<!doctype|<html|<head|<body|<script|<style|<meta|<\/|\b(?:postgres|supabase|postgrest|sqlstate|constraint|row-level security|rls|jwt|uuid|stack|trace|schema cache|syntax error|http.?error|internal server error)\b|\b(?:PGRST|2350\d|42501)\b|https?:\/\/|\bat\s+\S+\([^)]*:\d+:\d+\)|\{\s*"(?:error|message|stack)"|\b(?:select|insert|update|delete)\s+.+\s+from\b)/i;

/**
 * Converts internal, provider, network and HTML error responses into short
 * merchant-facing language. Raw code, markup, URLs, database details and stack
 * traces must never be shown in the SEZA merchant interface.
 */
export function userFacingError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

  const clean = message.replace(/\s+/g, " ").trim();

  if (/failed to fetch|networkerror|network request failed|load failed|connection.*lost/i.test(clean)) {
    return "Connection lost. Check your internet connection and try again.";
  }
  if (/unauthorized|not authenticated|session.*expired|invalid.*token/i.test(clean)) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (/timeout|timed out|gateway timeout/i.test(clean)) {
    return "SEZA is taking longer than expected. Please try again.";
  }

  if (!clean || clean.length > 180 || TECHNICAL_ERROR_PATTERN.test(clean)) return fallback;
  return clean;
}
