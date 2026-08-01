export type SezaPrivacyConsent = {
  essential: true;
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  updatedAt: string;
};

export const PRIVACY_CONSENT_KEY = "seza-privacy-consent-v1";

export function defaultPrivacyConsent(): SezaPrivacyConsent {
  return { essential: true, analytics: false, personalization: false, marketing: false, updatedAt: new Date().toISOString() };
}

export function readPrivacyConsent(): SezaPrivacyConsent {
  if (typeof window === "undefined") return defaultPrivacyConsent();
  try {
    const stored = JSON.parse(localStorage.getItem(PRIVACY_CONSENT_KEY) || "null");
    return { ...defaultPrivacyConsent(), ...(stored || {}), essential: true };
  } catch {
    return defaultPrivacyConsent();
  }
}

export function savePrivacyConsent(value: Omit<SezaPrivacyConsent, "essential" | "updatedAt">) {
  const next: SezaPrivacyConsent = { essential: true, ...value, updatedAt: new Date().toISOString() };
  localStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("seza:privacy-consent", { detail: next }));
  return next;
}
