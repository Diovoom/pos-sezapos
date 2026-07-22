// Backward-compatible wrappers around the locale-aware formatters.
// Prefer importing from "@/lib/i18n/formatters" + useLocaleContext() going forward.
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";

export const fmtCurrency = (n: number, currency = "USD") =>
  formatCurrency(n, { locale: "en-US", currency });

export const fmtNumber = (n: number) => formatNumber(n, { locale: "en-US" });
