export type UiTheme = "light" | "dark" | "system";
export type UiDensity = "comfortable" | "compact";
export type UiTextScale = "small" | "normal" | "large";

export type UiPreferences = {
  theme: UiTheme;
  density: UiDensity;
  textScale: UiTextScale;
  touchMode: boolean;
};

const KEY = "seza.ui.preferences.v2";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "system",
  density: "comfortable",
  textScale: "normal",
  touchMode: false,
};

export function loadUiPreferences(): UiPreferences {
  if (typeof window === "undefined") return DEFAULT_UI_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_UI_PREFERENCES;
    const value = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      theme: value.theme === "light" || value.theme === "dark" || value.theme === "system"
        ? value.theme
        : DEFAULT_UI_PREFERENCES.theme,
      density: value.density === "compact" || value.density === "comfortable"
        ? value.density
        : DEFAULT_UI_PREFERENCES.density,
      textScale: value.textScale === "small" || value.textScale === "normal" || value.textScale === "large"
        ? value.textScale
        : DEFAULT_UI_PREFERENCES.textScale,
      touchMode: typeof value.touchMode === "boolean" ? value.touchMode : DEFAULT_UI_PREFERENCES.touchMode,
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function applyUiPreferences(prefs: UiPreferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
  root.classList.toggle("dark", !!dark);
  root.dataset.uiDensity = prefs.density;
  root.dataset.uiText = prefs.textScale;
  root.dataset.uiTouch = prefs.touchMode ? "true" : "false";
}

export function saveUiPreferences(prefs: UiPreferences) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  }
  applyUiPreferences(prefs);
  window.dispatchEvent(new CustomEvent("seza:ui-preferences", { detail: prefs }));
}

export function initializeUiPreferences() {
  const prefs = loadUiPreferences();
  applyUiPreferences(prefs);
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemTheme = () => {
    const current = loadUiPreferences();
    if (current.theme === "system") applyUiPreferences(current);
  };
  media?.addEventListener?.("change", onSystemTheme);
  return () => media?.removeEventListener?.("change", onSystemTheme);
}
