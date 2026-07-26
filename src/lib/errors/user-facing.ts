const TECHNICAL_ERROR_PATTERN =
  /schema cache|column|relation|postgres|supabase|sqlstate|permission denied|row-level security|violates|uuid|stack|syntax error|fetch failed|networkerror|failed to fetch/i;

export function userFacingError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message || TECHNICAL_ERROR_PATTERN.test(message)) return fallback;
  return message.length > 180 ? fallback : message;
}
