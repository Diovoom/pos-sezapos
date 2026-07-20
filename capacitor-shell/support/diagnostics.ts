// Safe Android diagnostic payload for support tickets.
//
// Collects only non-sensitive device/app context. NEVER includes PINs,
// tokens, card data, or arbitrary storage contents. The result is a plain
// object that can be JSON-stringified into the ticket body / notes.

import { hardwareSnapshot } from "@/lib/hardware/native-receipt";

export type SupportDiagnostics = {
  app: {
    platform: "android-shell" | "web";
    appVersion: string | null;
    buildVersion: string | null;
    packageId: string | null;
    userAgent: string;
    language: string;
    online: boolean;
  };
  device: {
    manufacturer: string | null;
    model: string | null;
    osVersion: string | null;
    screen: { width: number; height: number; dpr: number };
    orientation: string;
  };
  hardware: {
    printerDriver: string;
    paperWidth: string;
    autoPrint: boolean;
    copies: number;
    kickOnCash: boolean;
    lastPrintOk: string | null;
    lastPrintErr: string | null;
    lastDrawerOk: string | null;
    lastDrawerErr: string | null;
  };
  context: {
    route: string;
    storeId: string | null;
    employeeId: string | null;
    registerId: string | null;
    shiftId: string | null;
    lastSyncAt: string | null;
    offlineQueueCount: number | null;
    correlationId: string;
    capturedAt: string;
  };
};


// Redact keys that should NEVER leave the device.
const FORBIDDEN_KEYS = /(?:pin|password|token|secret|apikey|api_key|authorization|card|cvv|cvc|track|pan|refresh)/i;

export function sanitizeForLog<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  const out: Record<string, unknown> = Array.isArray(value) ? ([] as unknown as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = typeof v === "object" && v !== null ? sanitizeForLog(v) : v;
  }
  return out as T;
}

function newCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function collectDiagnostics(opts: {
  route: string;
  storeId: string | null;
  employeeId: string | null;
  registerId?: string | null;
  shiftId?: string | null;
  lastSyncAt?: string | null;
  offlineQueueCount?: number | null;
}): Promise<SupportDiagnostics> {
  let appVersion: string | null = null;
  let buildVersion: string | null = null;
  let packageId: string | null = null;
  let manufacturer: string | null = null;
  let model: string | null = null;
  let osVersion: string | null = null;
  let platform: "android-shell" | "web" = "web";

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      platform = "android-shell";
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        appVersion = info.version ?? null;
        buildVersion = info.build ?? null;
        packageId = info.id ?? null;
      } catch {
        /* App plugin unavailable */
      }
      try {
        const { Device } = await import("@capacitor/device");
        const info = await Device.getInfo();
        manufacturer = info.manufacturer ?? null;
        model = info.model ?? null;
        osVersion = info.osVersion ?? null;
      } catch {
        /* Device plugin unavailable */
      }
    }
  } catch {
    /* not native */
  }

  return {
    app: {
      platform,
      appVersion,
      buildVersion,
      packageId,
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: typeof navigator.onLine === "boolean" ? navigator.onLine : true,
    },
    device: {
      manufacturer,
      model,
      osVersion,
      screen: {
        width: window.screen?.width ?? window.innerWidth,
        height: window.screen?.height ?? window.innerHeight,
        dpr: window.devicePixelRatio ?? 1,
      },
      orientation: (window.screen?.orientation?.type ?? "unknown") as string,
    },
    context: {
      route: opts.route,
      storeId: opts.storeId,
      employeeId: opts.employeeId,
      registerId: opts.registerId ?? null,
      shiftId: opts.shiftId ?? null,
      lastSyncAt: opts.lastSyncAt ?? null,
      offlineQueueCount: opts.offlineQueueCount ?? null,
      correlationId: newCorrelationId(),
      capturedAt: new Date().toISOString(),
    },
  };
}

export function formatDiagnosticsBlock(d: SupportDiagnostics): string {
  const safe = sanitizeForLog(d);
  return [
    "",
    "--- Device diagnostics (attached with consent) ---",
    "```json",
    JSON.stringify(safe, null, 2),
    "```",
  ].join("\n");
}
