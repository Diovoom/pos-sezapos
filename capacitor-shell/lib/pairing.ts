// APK localStorage helper for the device-pairing record. Persists across
// app launches; cleared only when an owner/manager revokes the device via
// the dashboard (server-side) — the APK detects a revoked device at
// verify-pin time and prompts to re-pair.
const KEY = "seza.pairing.v1";

export type Pairing = {
  deviceId: string;
  deviceSecret: string;
  storeId: string;
  label: string;
};

export function getPairing(): Pairing | null {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pairing>;
    if (!p.deviceId || !p.deviceSecret || !p.storeId) return null;
    return { deviceId: p.deviceId, deviceSecret: p.deviceSecret, storeId: p.storeId, label: p.label ?? "POS Register" };
  } catch {
    return null;
  }
}

export function setPairing(p: Pairing) {
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function clearPairing() {
  window.localStorage.removeItem(KEY);
}
