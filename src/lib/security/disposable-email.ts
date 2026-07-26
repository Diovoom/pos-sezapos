const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempail.com",
  "tempemail.com",
  "tempinbox.com",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.net",
  "vtmpj.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

const DISPOSABLE_PATTERNS = [
  /(^|[.-])10min(ute)?mail([.-]|$)/i,
  /(^|[.-])disposable([.-]|$)/i,
  /(^|[.-])fake(inbox|mail)([.-]|$)/i,
  /(^|[.-])guerrilla(mail)?([.-]|$)/i,
  /(^|[.-])mailinator([.-]|$)/i,
  /(^|[.-])temp([.-]?mail|email|inbox)([.-]|$)/i,
  /(^|[.-])throwaway([.-]?mail)?([.-]|$)/i,
  /(^|[.-])trashmail([.-]|$)/i,
  /(^|[.-])yopmail([.-]|$)/i,
];

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  return DISPOSABLE_PATTERNS.some((pattern) => pattern.test(domain));
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Temporary or disposable email addresses are not accepted. Use a permanent business email.";
