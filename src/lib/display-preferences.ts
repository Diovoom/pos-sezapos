export const TEXT_SCALE_KEY = "pos.display.textScale";

export function clampTextScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.3, Math.max(0.9, value));
}

export function readTextScale() {
  if (typeof window === "undefined") return 1;
  const parsed = Number(window.localStorage.getItem(TEXT_SCALE_KEY) ?? "1");
  return clampTextScale(parsed);
}

export function applyTextScale(value: number, persist = true) {
  if (typeof document === "undefined") return;
  const scale = clampTextScale(value);
  document.documentElement.style.fontSize = `${16 * scale}px`;
  document.documentElement.dataset.sezaTextScale = String(scale);
  if (persist && typeof window !== "undefined") {
    window.localStorage.setItem(TEXT_SCALE_KEY, String(scale));
    window.dispatchEvent(new CustomEvent("seza:display-preferences-changed"));
  }
}

export function applyStoredDisplayPreferences() {
  applyTextScale(readTextScale(), false);
}
