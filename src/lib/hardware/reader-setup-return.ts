// A fixed, same-origin settings destination only. Never accept an arbitrary URL
// or pass POS/device/session credentials to the browser.
const KEY = "seza.readerSetupReturn";
const STEPS = new Set(["connect_stripe", "verification", "bank", "address"]);
export function parseReaderSetupReturn(search: string) {
  const params = new URLSearchParams(search);
  const step = params.get("readerSetup") ?? "";
  const store = params.get("readerStore") ?? "";
  if (!STEPS.has(step) || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(store)) return null;
  return { section: step === "address" ? "general" : "payments", readerSetup: step, readerStore: store };
}
export function rememberReaderSetupReturn(search: string) {
  const target = parseReaderSetupReturn(search);
  if (target) try { sessionStorage.setItem(KEY, JSON.stringify({ target, expires: Date.now() + 30 * 60_000 })); } catch { /* browser storage disabled */ }
}
export function consumeReaderSetupReturn() {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const saved = JSON.parse(raw ?? "null");
    if (!saved || saved.expires < Date.now()) return null;
    return parseReaderSetupReturn(new URLSearchParams(saved.target).toString());
  } catch { return null; }
}
