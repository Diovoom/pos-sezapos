export const STRIPE_TERMINAL_DIAGNOSTIC_STAGES = [
  "MERCHANT_RESET",
  "STRIPE_INITIALIZE",
  "ANDROID_PERMISSION",
  "CONNECTION_TOKEN",
  "DISCOVER_USB",
  "DISCOVER_USB_EMPTY",
  "CONNECT_READER_NATIVE",
  "READER_API_SAVE",
  "CONNECTED",
] as const;

export type StripeTerminalDiagnosticStage =
  (typeof STRIPE_TERMINAL_DIAGNOSTIC_STAGES)[number];
export type StripeTerminalDiagnosticStatus = "progress" | "error" | "ok";
export type StripeTerminalDiagnosticTransport = "USB" | "Bluetooth" | null;

export type StripeTerminalDiagnostic = {
  version: 1;
  subsystem: "Stripe Terminal";
  stage: StripeTerminalDiagnosticStage;
  status: StripeTerminalDiagnosticStatus;
  transport: StripeTerminalDiagnosticTransport;
  reader_discovered: boolean | null;
  reader_serial: string | null;
  stripe_plugin_linked: boolean | null;
  merchant_ready: boolean | null;
  terminal_location_ready: boolean | null;
  connection_token_requested: boolean;
  connection_token_delivered: boolean;
  native_error_code: string | null;
  native_error: string | null;
  occurred_at: string;
};

type DiagnosticPatch = Partial<
  Omit<StripeTerminalDiagnostic, "version" | "subsystem" | "occurred_at">
>;

const STORAGE_KEY = "seza.internal.stripeTerminalDiagnostic.v1";
const MAX_ERROR_LENGTH = 500;
const MAX_CODE_LENGTH = 120;
const MAX_SERIAL_LENGTH = 160;
const STAGE_SET = new Set<string>(STRIPE_TERMINAL_DIAGNOSTIC_STAGES);

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

export function redactTerminalDiagnosticText(value: unknown): string | null {
  const primitive =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : null;
  const initial = cleanText(primitive, 2_000);
  if (!initial) return null;

  const redacted = initial
    // Authorization headers and common key/value secret fields.
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|connection[_ -]?token|actor[_ -]?token|device[_ -]?secret|client[_ -]?secret|secret|access[_ -]?token|refresh[_ -]?token|employee[_ -]?pin|pin)\b\s*[:=]\s*["']?[^\s,;"']+/gi,
      "$1=[REDACTED]",
    )
    // Stripe/API credentials and JWT-like bearer material.
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+\b/g, "[REDACTED_STRIPE_KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    // PAN-like card numbers. Reader serials are intentionally not redacted.
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]");

  return cleanText(redacted, MAX_ERROR_LENGTH);
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const candidate = record.code ?? record.errorCode ?? record.error_code ?? record.declineCode;
  return redactTerminalDiagnosticText(candidate)?.slice(0, MAX_CODE_LENGTH) ?? null;
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return redactTerminalDiagnosticText(error.message);
  if (typeof error === "string") return redactTerminalDiagnosticText(error);
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return redactTerminalDiagnosticText(
      record.message ?? record.localizedMessage ?? record.error ?? record.description,
    );
  }
  return redactTerminalDiagnosticText(error == null ? null : String(error));
}

function safeIso(value: unknown): string {
  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function normalizeTransport(value: unknown): StripeTerminalDiagnosticTransport {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "usb") return "USB";
  if (normalized === "bluetooth") return "Bluetooth";
  return null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function sanitizeStripeTerminalDiagnostic(
  value: unknown,
): StripeTerminalDiagnostic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!STAGE_SET.has(String(input.stage ?? ""))) return null;

  const stage = String(input.stage) as StripeTerminalDiagnosticStage;
  const status: StripeTerminalDiagnosticStatus =
    input.status === "error" ? "error" : input.status === "ok" ? "ok" : "progress";
  const nativeErrorCode =
    status === "ok" ? null : redactTerminalDiagnosticText(input.native_error_code)?.slice(0, MAX_CODE_LENGTH) ?? null;
  const nativeError = status === "ok" ? null : redactTerminalDiagnosticText(input.native_error);

  return {
    version: 1,
    subsystem: "Stripe Terminal",
    stage,
    status,
    transport: normalizeTransport(input.transport),
    reader_discovered: booleanOrNull(input.reader_discovered),
    reader_serial: cleanText(input.reader_serial, MAX_SERIAL_LENGTH),
    stripe_plugin_linked: booleanOrNull(input.stripe_plugin_linked),
    merchant_ready: booleanOrNull(input.merchant_ready),
    terminal_location_ready: booleanOrNull(input.terminal_location_ready),
    connection_token_requested: input.connection_token_requested === true,
    connection_token_delivered: input.connection_token_delivered === true,
    native_error_code: nativeErrorCode,
    native_error: nativeError,
    occurred_at: safeIso(input.occurred_at),
  };
}

function readStored(): StripeTerminalDiagnostic | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeStripeTerminalDiagnostic(JSON.parse(raw));
  } catch {
    return null;
  }
}

function persist(value: StripeTerminalDiagnostic, notify: boolean): StripeTerminalDiagnostic {
  const safe = sanitizeStripeTerminalDiagnostic(value) ?? value;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Diagnostics must never block checkout if device storage is unavailable.
    }
  }
  if (notify && typeof window !== "undefined") {
    window.dispatchEvent(new Event("seza:device-config-changed"));
  }
  return safe;
}

function baseDiagnostic(stage: StripeTerminalDiagnosticStage): StripeTerminalDiagnostic {
  return {
    version: 1,
    subsystem: "Stripe Terminal",
    stage,
    status: "progress",
    transport: null,
    reader_discovered: null,
    reader_serial: null,
    stripe_plugin_linked: null,
    merchant_ready: null,
    terminal_location_ready: null,
    connection_token_requested: false,
    connection_token_delivered: false,
    native_error_code: null,
    native_error: null,
    occurred_at: new Date().toISOString(),
  };
}

export function beginStripeTerminalDiagnostic(
  stage: StripeTerminalDiagnosticStage,
  patch: DiagnosticPatch = {},
): StripeTerminalDiagnostic {
  return persist(
    {
      ...baseDiagnostic(stage),
      ...patch,
      stage,
      status: "progress",
      native_error_code: null,
      native_error: null,
      occurred_at: new Date().toISOString(),
    },
    false,
  );
}

export function markStripeTerminalDiagnostic(
  stage: StripeTerminalDiagnosticStage,
  patch: DiagnosticPatch = {},
): StripeTerminalDiagnostic {
  const previous = readStored() ?? baseDiagnostic(stage);
  // Once the root failure has been captured, later cleanup/native fallout must
  // not replace it with a less useful downstream stage.
  if (previous.status === "error") return previous;
  return persist(
    {
      ...previous,
      ...patch,
      stage,
      status: "progress",
      occurred_at: new Date().toISOString(),
    },
    false,
  );
}

export function failStripeTerminalDiagnostic(
  stage: StripeTerminalDiagnosticStage,
  error: unknown,
  patch: DiagnosticPatch = {},
): StripeTerminalDiagnostic {
  const previous = readStored() ?? baseDiagnostic(stage);
  if (previous.status === "error") return previous;
  return persist(
    {
      ...previous,
      ...patch,
      stage,
      status: "error",
      native_error_code: extractErrorCode(error),
      native_error: extractErrorMessage(error) ?? "Native card reader operation failed.",
      occurred_at: new Date().toISOString(),
    },
    true,
  );
}

export function succeedStripeTerminalDiagnostic(
  patch: DiagnosticPatch = {},
): StripeTerminalDiagnostic {
  const previous = readStored() ?? baseDiagnostic("CONNECTED");
  return persist(
    {
      ...previous,
      ...patch,
      stage: "CONNECTED",
      status: "ok",
      reader_discovered: patch.reader_discovered ?? previous.reader_discovered ?? true,
      native_error_code: null,
      native_error: null,
      occurred_at: new Date().toISOString(),
    },
    true,
  );
}

export function getStripeTerminalDiagnosticForHeartbeat(): StripeTerminalDiagnostic | null {
  const diagnostic = readStored();
  return diagnostic ? sanitizeStripeTerminalDiagnostic(diagnostic) : null;
}
