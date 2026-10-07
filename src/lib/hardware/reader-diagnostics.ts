// Shared allowlist: applied on the device AND again at the heartbeat boundary.
// Native objects, free-form messages, credentials and client identity never pass.
export const READER_CONNECTION_MESSAGE = "Could not connect to the card reader. Please try again.";
export const READER_STAGES = ["MERCHANT_RESET", "STRIPE_INITIALIZE", "ANDROID_PERMISSION", "CONNECTION_TOKEN", "DISCOVER_USB", "DISCOVER_USB_EMPTY", "DISCOVER_BLUETOOTH", "CONNECT_READER_NATIVE", "READER_API_SAVE", "CONNECTED", "DISCONNECTED"] as const;
export type ReaderStage = typeof READER_STAGES[number];
const ERRORS = {
  PERMISSION: "Required reader permission was not granted.",
  NETWORK: "The reader service could not be reached.",
  TOKEN: "Connection token delivery failed.",
  USB_ABSENT: "No matching physical USB reader was detected.",
  USB_NOT_ADOPTED: "USB reader is present but Stripe discovery returned no reader.",
  DISCOVERY_EMPTY: "Stripe discovery returned no matching reader.",
  STALE_READER: "The discovered reader is no longer available to the SDK.",
  BUSY: "A native reader operation is already running.",
  RESET: "Native merchant credentials could not be reset.",
  NATIVE: "The native reader operation failed.",
} as const;
export function readerErrorCode(error: unknown): keyof typeof ERRORS {
  // Inspect only primitive fields. Never stringify the native object or stack.
  const e = error as { message?: unknown; code?: unknown } | null;
  const text = [typeof e?.code === "string" ? e.code : "", typeof e?.message === "string" ? e.message : ""].join(" ").slice(0, 2000);
  if (/permission/i.test(text)) return "PERMISSION";
  if (/network|fetch|timed? ?out|connection lost/i.test(text)) return "NETWORK";
  if (/token/i.test(text)) return "TOKEN";
  if (/reader value|not.*discover|stale/i.test(text)) return "STALE_READER";
  if (/busy|progress|already.*connect/i.test(text)) return "BUSY";
  return "NATIVE";
}
export function sanitizeReaderDiagnostic(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  if (!(READER_STAGES as readonly unknown[]).includes(d.stage)) return null;
  const connected = d.stage === "CONNECTED" && d.status === "ok";
  const code = !connected && typeof d.native_error_code === "string" && Object.hasOwn(ERRORS, d.native_error_code)
    ? d.native_error_code as keyof typeof ERRORS : null;
  const flags = ["reader_discovered", "plugin_linked", "merchant_ready", "terminal_location_ready", "connection_token_requested", "connection_token_delivered", "usb_device_found", "usb_permission_granted"] as const;
  return {
    subsystem: "stripe_terminal",
    stage: d.stage as ReaderStage,
    status: d.status === "ok" ? "ok" : d.status === "error" ? "error" : "pending",
    transport: d.transport === "usb" || d.transport === "bluetooth" ? d.transport : null,
    reader_serial: typeof d.reader_serial === "string" && /^STRM2[A-Z0-9]{1,28}$/i.test(d.reader_serial) ? d.reader_serial : null,
    ...Object.fromEntries(flags.map(key => [key, typeof d[key] === "boolean" ? d[key] : null])) as Record<typeof flags[number], boolean | null>,
    native_error_code: code,
    native_error: code ? ERRORS[code] : null,
    timestamp: typeof d.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(d.timestamp) && Number.isFinite(Date.parse(d.timestamp)) ? d.timestamp.slice(0, 30) : null,
  };
}
let latest: ReturnType<typeof sanitizeReaderDiagnostic> = null;
export function recordReaderDiagnostic(stage: ReaderStage, status: "pending" | "ok" | "error", fields: Record<string, unknown> = {}) {
  latest = sanitizeReaderDiagnostic({ ...latest, ...fields, stage, status, timestamp: new Date().toISOString(), native_error_code: status === "error" ? fields.native_error_code ?? "NATIVE" : null });
}
export function getReaderDiagnostic() { return sanitizeReaderDiagnostic(latest); }
export function clearReaderDiagnostic() { latest = null; }

// Rebuild operational snapshots instead of trusting arbitrary nested client data.
export function operationalSnapshot(input: unknown): Record<string, unknown> {
  const src = input && typeof input === "object" ? input as Record<string, any> : {};
  const out: Record<string, any> = {};
  const fields: Record<string, string[]> = {
    printer: ["driver", "driver_label", "configured", "paired", "connected", "paper_width", "auto_print", "last_ok"],
    drawer: ["enabled", "open_on_cash", "open_on_refund", "last_ok"],
    scanner: ["mode", "suffix", "debounce_ms", "last_scan_at"],
    terminal: ["driver", "connected", "last_connected_at"],
  };
  for (const [section, keys] of Object.entries(fields)) {
    out[section] = {};
    for (const key of keys) {
      const value = src[section]?.[key];
      // Text is restricted to simple operational labels/timestamps, never errors.
      if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) out[section][key] = value;
      else if (typeof value === "string" && value.length <= 60 && /^[a-z0-9 .:_-]+$/i.test(value) && !/(secret|token|bearer|acct_|pi_|seti_|sk_|eyJ)/i.test(value)) out[section][key] = value;
    }
  }
  out.online = src.online === true;
  if (typeof src.captured_at === "string" && /^[\dT:Z.+-]{10,30}$/.test(src.captured_at)) out.captured_at = src.captured_at;
  if (typeof src.route === "string" && /^\/[a-z0-9/_-]{0,120}$/i.test(src.route)) out.route = src.route;
  return out;
}
