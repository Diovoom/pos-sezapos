// Only allowlisted classifications leave the native bridge. Never copy raw errors.
export const READER_CONNECTION_MESSAGE = "Could not connect to the card reader. Please try again.";
export const READER_MESSAGES = {
  SESSION: "Your POS session has expired. Sign in on this register and try again.",
  CONTEXT: "SEZA could not check this store’s card reader setup. Check the connection and try again.",
  CONFIGURE: "SEZA could not save this register’s reader setup. Try again.",
  USB_ABSENT: "No card reader detected. Connect and power on the Stripe Reader M2, then try again.",
  USB_PERMISSION: "Card reader detected, but USB access is blocked. Allow USB access and try again.",
  USB_NOT_ADOPTED: "Card reader detected, but SEZA could not start it. Reconnect the USB data cable and try again.",
  TOKEN: "SEZA could not authorize this card reader with Stripe. Check the store’s Stripe connection and try again.",
  MERCHANT_SETUP: "Card payments are not ready for this store. Finish Stripe setup in the Owner Dashboard.",
  LOCATION: "This store’s card reader location is not ready. Check the store address and Stripe setup.",
  READER_IN_USE: "This card reader is connected to another device. Disconnect it there and try again.",
  BATTERY: "Charge the card reader above 50%, then try again.",
  UPDATE: "The card reader needs an update. Keep it powered and connected, then try again.",
  UPDATING: "The card reader is updating. Keep it powered and connected and wait for the update to finish.",
  PERMISSION: "Allow Precise Location for SEZA POS in Android Settings, then try again.",
  NETWORK: "SEZA could not reach the card reader service. Check the internet connection and try again.",
  DISCOVERY_EMPTY: "No card reader detected. Power on the saved reader and try again.",
  STALE_READER: "The saved card reader was not found. Reconnect it and scan again.",
  BUSY: "A card reader operation is already running. Wait for it to finish and try again.",
  SAVE: "Card reader connected, but SEZA could not save it. Check the internet connection and try again.",
  RESET: READER_CONNECTION_MESSAGE,
  NATIVE: "Card reader detected, but the connection failed. Restart the reader and try again.",
} as const;
export type ReaderErrorCode = keyof typeof READER_MESSAGES;
export const READER_STAGES = ["MERCHANT_RESET", "POS_AUTH", "READER_API_CONFIGURE", "MERCHANT_CONTEXT", "STRIPE_INITIALIZE", "ANDROID_USB_DETECTION", "ANDROID_PERMISSION", "CONNECTION_TOKEN", "CONNECTION_TOKEN_REQUEST", "CONNECTION_TOKEN_DELIVERED", "DISCOVER_USB", "USB_DEVICE_FOUND", "STRIPE_READER_DISCOVERED", "DISCOVER_USB_EMPTY", "DISCOVER_BLUETOOTH", "CONNECT_READER_NATIVE", "READER_UPDATE", "READER_API_SAVE", "CONNECTED", "RECONNECT", "DISCONNECTED"] as const;
export type ReaderStage = typeof READER_STAGES[number];
type Status = "pending" | "ok" | "error";
function errorCode(value: unknown): ReaderErrorCode | null {
  return typeof value === "string" && Object.hasOwn(READER_MESSAGES, value) ? value as ReaderErrorCode : null;
}
export function readerErrorCode(error: unknown): ReaderErrorCode {
  const e = error as { message?: unknown; code?: unknown } | null;
  const known = errorCode(e?.code);
  if (known) return known;
  const code = typeof e?.code === "string" ? e.code.toUpperCase() : "";
  const text = [code, typeof e?.message === "string" ? e.message : ""].join(" ").slice(0, 2000);
  // Reader contention requires a real Stripe code; OPERATION_IN_PROGRESS is local busy.
  if (/^(READER_IN_USE|READER_BUSY|READER_CONNECTED_TO_ANOTHER_DEVICE)$/.test(code)) return "READER_IN_USE";
  if (/connection.?token|token.?provider|authentication|authorization|account.*invalid/i.test(text)) return "TOKEN";
  if (/location.*(invalid|missing|not.*found)|invalid.*location/i.test(text)) return "LOCATION";
  if (/battery|READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW/i.test(text)) return "BATTERY";
  if (/software.?update|update.*(failed|required)/i.test(text)) return "UPDATE";
  if (/usb.*permission|permission.*usb/i.test(text)) return "USB_PERMISSION";
  if (/permission/i.test(text)) return "PERMISSION";
  if (/reader value|not.*discover|stale/i.test(text)) return "STALE_READER";
  if (/busy|progress|already.*connect/i.test(text)) return "BUSY";
  if (/network|fetch|timed? ?out|connection lost/i.test(text)) return "NETWORK";
  return "NATIVE";
}
export function readerMessage(code: ReaderErrorCode | null | undefined) {
  return code ? READER_MESSAGES[code] : READER_CONNECTION_MESSAGE;
}
export function safeReaderMessage(error: unknown) {
  const message = typeof error === "string" ? error : (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && (Object.values(READER_MESSAGES) as string[]).includes(message) ? message : READER_CONNECTION_MESSAGE;
}
export function readerFailure(code: ReaderErrorCode): Error & { code: ReaderErrorCode } {
  return Object.assign(new Error(readerMessage(code)), { code });
}
function timestamp(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value.slice(0, 30) : null;
}
function duration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 3_600_000) : null;
}
function stage(value: unknown): ReaderStage | null {
  return (READER_STAGES as readonly unknown[]).includes(value) ? value as ReaderStage : null;
}
function status(value: unknown): Status { return value === "ok" || value === "error" ? value : "pending"; }
export function sanitizeReaderDiagnostic(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  const currentStage = stage(d.stage);
  if (!currentStage) return null;
  const code = d.status === "error" ? errorCode(d.native_error_code) : null;
  const flags = ["reader_discovered", "plugin_linked", "plugin_initialized", "merchant_ready", "terminal_location_ready", "connection_token_requested", "connection_token_delivered", "usb_device_found", "usb_permission_granted"] as const;
  const timeline = (Array.isArray(d.timeline) ? d.timeline : []).slice(-36).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const s = stage(item.stage), at = timestamp(item.timestamp);
    if (!s || !at) return [];
    return [{ stage: s, status: status(item.status), timestamp: at, duration_ms: duration(item.duration_ms) }];
  });
  return {
    subsystem: "stripe_terminal",
    attempt_id: typeof d.attempt_id === "string" && /^[a-f0-9-]{36}$/i.test(d.attempt_id) ? d.attempt_id : null,
    stage: currentStage,
    failed_stage: code ? stage(d.failed_stage) ?? currentStage : null,
    status: status(d.status),
    transport: d.transport === "usb" || d.transport === "bluetooth" ? d.transport : null,
    // Android enumeration alone must never supply a serial to diagnostics.
    reader_serial: d.reader_discovered === true && typeof d.reader_serial === "string" && /^STRM2[A-Z0-9]{1,28}$/i.test(d.reader_serial) ? d.reader_serial : null,
    ...Object.fromEntries(flags.map(key => [key, typeof d[key] === "boolean" ? d[key] : null])) as Record<typeof flags[number], boolean | null>,
    native_error_code: code,
    native_error: code ? readerMessage(code) : null,
    timestamp: timestamp(d.timestamp),
    duration_ms: duration(d.duration_ms),
    timeline,
  };
}
let latest: ReturnType<typeof sanitizeReaderDiagnostic> = null;
let attemptStartedAt = 0;
export function beginReaderAttempt() {
  clearReaderDiagnostic();
  attemptStartedAt = Date.now();
  latest = sanitizeReaderDiagnostic({ stage: "MERCHANT_CONTEXT", status: "pending", attempt_id: globalThis.crypto?.randomUUID?.() ?? null, timeline: [] });
}
export function recordReaderDiagnostic(currentStage: ReaderStage, currentStatus: Status, fields: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const elapsed = Math.max(0, Date.now() - (attemptStartedAt || Date.now()));
  latest = sanitizeReaderDiagnostic({ ...latest, ...fields, stage: currentStage, status: currentStatus, timestamp: now, duration_ms: elapsed,
    failed_stage: currentStatus === "error" ? currentStage : null,
    native_error_code: currentStatus === "error" ? fields.native_error_code ?? "NATIVE" : null,
    timeline: [...(latest?.timeline ?? []), { stage: currentStage, status: currentStatus, timestamp: now, duration_ms: elapsed }],
  });
  // Bounded, sanitized local evidence survives process restart while the Admin
  // table migration is pending. It is never rendered as a cashier developer dump.
  try { localStorage.setItem("pos.stripe.lastDiagnostic", JSON.stringify(latest)); } catch { /* optional telemetry */ }
}
export function getReaderDiagnostic() {
  if (!latest) { try { latest = sanitizeReaderDiagnostic(JSON.parse(localStorage.getItem("pos.stripe.lastDiagnostic") || "null")); } catch { /* unavailable */ } }
  return sanitizeReaderDiagnostic(latest);
}
export function clearReaderDiagnostic() {
  latest = null; attemptStartedAt = 0;
  try { localStorage.removeItem("pos.stripe.lastDiagnostic"); } catch { /* unavailable */ }
}

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

