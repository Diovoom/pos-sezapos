export type CustomerDisplayIdleMode = "message" | "image";

export type CustomerDisplaySettings = {
  idleMode: CustomerDisplayIdleMode;
  welcomeMessage: string;
  imageUrl: string | null;
  textScale: number;
};

export const DEFAULT_CUSTOMER_DISPLAY_SETTINGS: CustomerDisplaySettings = {
  idleMode: "message",
  welcomeMessage: "Welcome",
  imageUrl: null,
  textScale: 1,
};

export const CUSTOMER_DISPLAY_LOCAL_KEYS = {
  idleMode: "pos.customerDisplay.idleMode",
  welcomeMessage: "pos.customerDisplay.welcomeMessage",
  textScale: "pos.customerDisplay.textScale",
} as const;

function clampScale(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1.8, Math.max(0.8, parsed));
}

export function normalizeCustomerDisplaySettings(raw: unknown): CustomerDisplaySettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const idleMode = value.idleMode === "image" ? "image" : "message";
  const welcomeMessage = String(value.welcomeMessage ?? DEFAULT_CUSTOMER_DISPLAY_SETTINGS.welcomeMessage)
    .trim()
    .slice(0, 48) || DEFAULT_CUSTOMER_DISPLAY_SETTINGS.welcomeMessage;
  const imageUrl = typeof value.imageUrl === "string" && value.imageUrl.trim()
    ? value.imageUrl.trim()
    : null;

  return {
    idleMode,
    welcomeMessage,
    imageUrl,
    textScale: clampScale(value.textScale),
  };
}

export function resolveCustomerDisplaySettings(cloud: unknown): CustomerDisplaySettings {
  const base = normalizeCustomerDisplaySettings(cloud);
  if (typeof window === "undefined") return base;

  try {
    const mode = window.localStorage.getItem(CUSTOMER_DISPLAY_LOCAL_KEYS.idleMode);
    const message = window.localStorage.getItem(CUSTOMER_DISPLAY_LOCAL_KEYS.welcomeMessage);
    const scale = window.localStorage.getItem(CUSTOMER_DISPLAY_LOCAL_KEYS.textScale);

    return {
      idleMode: mode === "message" || mode === "image" ? mode : base.idleMode,
      welcomeMessage: message != null && message.trim()
        ? message.trim().slice(0, 48)
        : base.welcomeMessage,
      imageUrl: base.imageUrl,
      textScale: scale != null ? clampScale(scale) : base.textScale,
    };
  } catch {
    return base;
  }
}

export function clearLocalCustomerDisplayOverrides() {
  if (typeof window === "undefined") return;
  Object.values(CUSTOMER_DISPLAY_LOCAL_KEYS).forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
