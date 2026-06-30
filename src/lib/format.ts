export const fmtCurrency = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number.isFinite(n) ? n : 0);

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat("en-US").format(Number.isFinite(n) ? n : 0);
