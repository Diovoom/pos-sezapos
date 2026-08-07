export function stripReceiptReferences(value?: string | null): string {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(
          /\b(?:ref(?:erence)?|transaction\s*(?:ref(?:erence)?|id)|payment\s*(?:ref(?:erence)?|id))\s*:\s*[A-Za-z0-9][A-Za-z0-9._/-]*/gi,
          "",
        )
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function compactCashierDisplayName(value?: string | null): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const initial = parts[parts.length - 1]?.charAt(0).toUpperCase();
  return initial ? `${parts[0]} ${initial}.` : parts[0];
}
