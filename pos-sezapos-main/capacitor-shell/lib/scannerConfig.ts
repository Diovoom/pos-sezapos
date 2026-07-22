// Device-scoped physical scanner configuration (APK).
// Persisted to localStorage under a single versioned key.
export type ScannerConfig = {
  enabled: boolean;
  type: "usb-wedge" | "bluetooth-wedge" | "generic-hid";
  suffixEnter: boolean;
  suffixTab: boolean;
  debounceMs: number;      // min gap between two accepted scans of the SAME code
  minLength: number;
  maxLength: number;
  successSound: boolean;
  errorSound: boolean;
  vibrate: boolean;
  allowInRegister: boolean;
  allowInSearch: boolean;
  // last-seen telemetry (safe, opt-in)
  lastScanAt?: string | null;
  lastBarcode?: string | null;
  lastMatchedProduct?: string | null;
  lastError?: string | null;
};

const KEY = "seza.device.scanner.v1";
const DEFAULT: ScannerConfig = {
  enabled: true,
  type: "usb-wedge",
  suffixEnter: true,
  suffixTab: false,
  debounceMs: 400,
  minLength: 4,
  maxLength: 64,
  successSound: true,
  errorSound: true,
  vibrate: true,
  allowInRegister: true,
  allowInSearch: true,
};

export function loadScannerConfig(): ScannerConfig {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch { return DEFAULT; }
}

export function saveScannerConfig(patch: Partial<ScannerConfig>) {
  const next = { ...loadScannerConfig(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("seza-scanner-config-change"));
  return next;
}

/* --------------------------- keyboard-wedge capture ----------------------- */

export type ScannerEvent = { barcode: string; at: number };

/**
 * Attach a global keydown listener that reconstructs barcodes typed by a
 * USB/Bluetooth keyboard-wedge scanner. Ignores input while the focused
 * element is an editable field (input, textarea, contentEditable). Applies
 * duplicate-scan suppression using `debounceMs` on identical codes.
 *
 * Returns an unsubscribe function.
 */
export function attachWedgeListener(onScan: (ev: ScannerEvent) => void): () => void {
  const cfg = loadScannerConfig();
  let buffer = "";
  let lastKeyAt = 0;
  let lastAcceptedAt = 0;
  let lastAcceptedCode = "";

  const INTER_KEY_MS = 50; // scanners burst << 50ms between keys

  const isEditable = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  };

  const commit = (code: string) => {
    const now = Date.now();
    if (code.length < cfg.minLength || code.length > cfg.maxLength) return;
    if (code === lastAcceptedCode && now - lastAcceptedAt < cfg.debounceMs) return;
    lastAcceptedCode = code;
    lastAcceptedAt = now;
    onScan({ barcode: code, at: now });
  };

  const handler = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return;
    const now = Date.now();
    if (now - lastKeyAt > INTER_KEY_MS) buffer = "";
    lastKeyAt = now;

    const isSuffix = (cfg.suffixEnter && e.key === "Enter") || (cfg.suffixTab && e.key === "Tab");
    if (isSuffix) {
      const code = buffer.trim();
      buffer = "";
      if (code) { e.preventDefault(); commit(code); }
      return;
    }
    if (e.key.length === 1) buffer += e.key;
  };
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}
