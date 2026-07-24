// Pairing metadata is held in memory after boot. On Android the full record,
// including the long-lived device secret, is encrypted by Android Keystore and
// stored in private SharedPreferences. localStorage is used only as a browser
// fallback and for one-time migration from older APK builds.
import { Capacitor, registerPlugin } from "@capacitor/core";

const LEGACY_KEY = "seza.pairing.v1";

export type Pairing = {
  deviceId: string;
  deviceSecret: string;
  storeId: string;
  label: string;
};

type SecureStoragePlugin = {
  savePairing(options: { value: string }): Promise<void>;
  loadPairing(): Promise<{ value: string | null }>;
  clearPairing(): Promise<void>;
};

const SecureStorage = registerPlugin<SecureStoragePlugin>("SezaSecureStorage");
let memoryPairing: Pairing | null = null;
let initialized = false;

function parsePairing(raw: string | null): Pairing | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pairing>;
    if (!p.deviceId || !p.deviceSecret || !p.storeId) return null;
    return {
      deviceId: p.deviceId,
      deviceSecret: p.deviceSecret,
      storeId: p.storeId,
      label: p.label ?? "POS Register",
    };
  } catch {
    return null;
  }
}

export async function initializePairing(): Promise<Pairing | null> {
  if (initialized) return memoryPairing;
  initialized = true;

  const legacy = typeof window === "undefined" ? null : window.localStorage.getItem(LEGACY_KEY);
  if (!Capacitor.isNativePlatform()) {
    memoryPairing = parsePairing(legacy);
    return memoryPairing;
  }

  try {
    const secure = await SecureStorage.loadPairing();
    memoryPairing = parsePairing(secure.value);
    if (!memoryPairing) {
      const migrated = parsePairing(legacy);
      if (migrated) {
        await SecureStorage.savePairing({ value: JSON.stringify(migrated) });
        memoryPairing = migrated;
      }
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.warn("[pairing] secure storage unavailable", error);
    memoryPairing = null;
    window.localStorage.removeItem(LEGACY_KEY);
  }
  return memoryPairing;
}

/** Synchronous after initializePairing() completes during shell bootstrap. */
export function getPairing(): Pairing | null {
  if (!initialized && typeof window !== "undefined") {
    // Browser/dev fallback. Native production boot always initializes first.
    return parsePairing(window.localStorage.getItem(LEGACY_KEY));
  }
  return memoryPairing;
}

export async function setPairing(pairing: Pairing): Promise<void> {
  memoryPairing = pairing;
  initialized = true;
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.savePairing({ value: JSON.stringify(pairing) });
    window.localStorage.removeItem(LEGACY_KEY);
  } else {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(pairing));
  }
  window.dispatchEvent(new Event("seza:pairing-changed"));
}

export function clearPairing(): void {
  memoryPairing = null;
  initialized = true;
  if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_KEY);
  if (Capacitor.isNativePlatform()) {
    void SecureStorage.clearPairing().catch((error) => console.warn("[pairing] secure clear failed", error));
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("seza:pairing-changed"));
}
