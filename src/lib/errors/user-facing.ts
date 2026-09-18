const TECHNICAL_ERROR_PATTERN =
  /(?:<!doctype|<html|<head|<body|<script|<style|<meta|<\/|\b(?:postgres|supabase|postgrest|sqlstate|constraint|row-level security|rls|jwt|uuid|stack|trace|schema cache|syntax error|http.?error|internal server error|api key|authorization header|invalid_request_error|invalid_v2_key|request[_ -]?id|process\.env|secret key|webhook secret|vite|rolldown|webpack|node_modules|typeerror|referenceerror|rangeerror|syntaxerror|enoent|eacces|kotlin|android sdk|stripe|finix)\b|\b(?:PGRST|2350\d|42501)\b|\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9_*.-]+|\bwhsec_[A-Za-z0-9_*.-]+|https?:\/\/|\bat\s+\S+\([^)]*:\d+:\d+\)|\{\s*"(?:error|message|stack)"|\b(?:select|insert|update|delete)\s+.+\s+from\b|\b[A-Za-z]:\\[^\s]+|\/(?:src|node_modules)\/[^\s]+|\.(?:ts|tsx|js|jsx):\d+(?::\d+)?|cannot read propert(?:y|ies)|is not a function|failed to execute|unexpected token)/i;

export function userFacingError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

  const clean = message.replace(/^error:\s*/i, "").replace(/\s+/g, " ").trim();

  if (/(?:SEZA[-]RAW|AndroidManifest\.xml|android\.permission\.|missing the following permissions|source release|Gradle|Capacitor|sdkmanager|java\.lang\.|com\.stripe\.|StripeException)/i.test(clean)) {
    return fallback;
  }

  if (/invalid login credentials|invalid email or password|email.*password.*invalid/i.test(clean)) {
    return "Invalid email or password.";
  }
  if (/email not confirmed|confirm your email|verification.*email/i.test(clean)) {
    return "Verify your email before signing in.";
  }
  if (/failed to fetch|networkerror|network request failed|load failed|connection.*lost|network.*offline/i.test(clean)) {
    return "Connection lost. Check your internet connection and try again.";
  }
  if (/unauthorized|not authenticated|session.*expired|invalid.*token/i.test(clean)) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (/permission.*denied|not allowed|insufficient permission/i.test(clean)) {
    return "You do not have permission to complete this action.";
  }
  if (/timeout|timed out|gateway timeout/i.test(clean)) {
    return "SEZA is taking longer than expected. Please try again.";
  }

  if (!clean || clean.length > 180 || TECHNICAL_ERROR_PATTERN.test(clean)) return fallback;
  return clean;
}
