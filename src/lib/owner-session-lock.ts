const OWNER_SESSION_USER_ID = "seza.owner.session.user_id";
const OWNER_SESSION_EMAIL = "seza.owner.session.email";
const OWNER_LOGIN_INTENT = "seza.owner.login.intent";

const normalizeEmail = (value?: string | null) => (value ?? "").trim().toLowerCase();

export type OwnerSessionIdentity = {
  id: string;
  email?: string | null;
};

export function setOwnerLoginIntent(email: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(OWNER_LOGIN_INTENT, normalizeEmail(email));
}

export function getOwnerLoginIntent(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(OWNER_LOGIN_INTENT);
}

export function clearOwnerLoginIntent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(OWNER_LOGIN_INTENT);
}

export function rememberOwnerSessionIdentity(user: OwnerSessionIdentity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OWNER_SESSION_USER_ID, user.id);
  window.localStorage.setItem(OWNER_SESSION_EMAIL, normalizeEmail(user.email));
}

export function clearOwnerSessionIdentity() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OWNER_SESSION_USER_ID);
  window.localStorage.removeItem(OWNER_SESSION_EMAIL);
}

export function hasOwnerSessionIdentity(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(OWNER_SESSION_USER_ID));
}

export function ownerSessionIdentityMatches(user: OwnerSessionIdentity): boolean {
  if (typeof window === "undefined") return true;
  const expectedId = window.localStorage.getItem(OWNER_SESSION_USER_ID);
  const expectedEmail = normalizeEmail(window.localStorage.getItem(OWNER_SESSION_EMAIL));
  if (!expectedId) return true;
  if (expectedId !== user.id) return false;
  if (expectedEmail && expectedEmail !== normalizeEmail(user.email)) return false;
  return true;
}
