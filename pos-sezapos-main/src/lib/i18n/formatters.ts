// Locale-aware formatters for the global POS platform.
// All screens should route through these instead of hard-coded en-US/USD.

export type LocaleContext = {
  locale: string;               // e.g. "en-US", "fr-FR", "ar-SA"
  currency: string;             // ISO 4217, e.g. "USD"
  currencySymbol?: string;      // display override
  symbolPosition?: "before" | "after";
  decimalPrecision?: number;
  thousandsSep?: string;
  decimalSep?: string;
  dateFormat?: string;
  timeFormat?: string;
  timeZone?: string;
};

const DEFAULT_CTX: LocaleContext = {
  locale: "en-US",
  currency: "USD",
  currencySymbol: "$",
  symbolPosition: "before",
  decimalPrecision: 2,
  thousandsSep: ",",
  decimalSep: ".",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "h:mm A",
};

export function formatCurrency(value: number, ctx: Partial<LocaleContext> = {}): string {
  const c = { ...DEFAULT_CTX, ...ctx };
  const n = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency",
      currency: c.currency,
      minimumFractionDigits: c.decimalPrecision,
      maximumFractionDigits: c.decimalPrecision,
    }).format(n);
  } catch {
    const abs = Math.abs(n).toFixed(c.decimalPrecision);
    const [i, d] = abs.split(".");
    const intPart = i.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousandsSep!);
    const num = d ? `${intPart}${c.decimalSep}${d}` : intPart;
    const sign = n < 0 ? "-" : "";
    return c.symbolPosition === "after"
      ? `${sign}${num} ${c.currencySymbol}`
      : `${sign}${c.currencySymbol}${num}`;
  }
}

export function formatNumber(value: number, ctx: Partial<LocaleContext> = {}): string {
  const c = { ...DEFAULT_CTX, ...ctx };
  const n = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(c.locale).format(n);
  } catch {
    return String(n);
  }
}

export function formatDate(value: Date | string | number, ctx: Partial<LocaleContext> = {}): string {
  const c = { ...DEFAULT_CTX, ...ctx };
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(c.locale, {
      dateStyle: "medium",
      timeZone: c.timeZone,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatTime(value: Date | string | number, ctx: Partial<LocaleContext> = {}): string {
  const c = { ...DEFAULT_CTX, ...ctx };
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(c.locale, {
      timeStyle: "short",
      timeZone: c.timeZone,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

export function formatDateTime(value: Date | string | number, ctx: Partial<LocaleContext> = {}): string {
  return `${formatDate(value, ctx)} ${formatTime(value, ctx)}`;
}

export function formatPhone(value: string | null | undefined, format?: string): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (!format) return value;
  let i = 0;
  return format.replace(/#/g, () => digits[i++] ?? "");
}

export function formatAddress(
  parts: { line1?: string; line2?: string; city?: string; region?: string; postal?: string; country?: string },
  template?: string[],
): string {
  const t = template ?? ["{line1}", "{line2}", "{city}, {region} {postal}", "{country}"];
  return t
    .map((row) =>
      row
        .replace(/\{line1\}/g, parts.line1 ?? "")
        .replace(/\{line2\}/g, parts.line2 ?? "")
        .replace(/\{city\}/g, parts.city ?? "")
        .replace(/\{region\}/g, parts.region ?? "")
        .replace(/\{postal\}/g, parts.postal ?? "")
        .replace(/\{country\}/g, parts.country ?? "")
        .replace(/\s+,/g, ",")
        .replace(/,\s*$/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}
