// AAMVA (US/CA driver's license) PDF417 barcode parser + verification helpers.
// Ref: AAMVA DL/ID Card Design Standard.
// We only extract the minimum data required for age verification and never
// persist the full document number by default.

export type ParsedID = {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  fullName?: string;
  dob?: Date; // date of birth
  expires?: Date; // ID expiration
  documentNumber?: string;
  raw?: string;
  format: "aamva" | "unknown";
};

export type AgeVerificationSettings = {
  enabled: boolean;
  requireIdEveryTime: boolean;
  allowManualEntry: boolean;
  requireManagerForManual: boolean;
  acceptedIdTypes: string[]; // labels only
  retentionDays: number; // audit log retention (informational)
  categoryMinAges: Record<string, number>; // e.g. { alcohol: 21, tobacco: 21, lottery: 18 }
};

export const DEFAULT_AGE_SETTINGS: AgeVerificationSettings = {
  enabled: true,
  requireIdEveryTime: true,
  allowManualEntry: true,
  requireManagerForManual: true,
  acceptedIdTypes: ["Driver's License", "State ID", "Passport", "Military ID"],
  retentionDays: 365,
  categoryMinAges: {
    alcohol: 21,
    beer: 21,
    wine: 21,
    spirits: 21,
    tobacco: 21,
    cigarettes: 21,
    cigars: 21,
    vape: 21,
    nicotine: 21,
    lottery: 18,
    other: 21,
  },
};

export const AGE_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "alcohol", label: "Alcohol (general)" },
  { id: "beer", label: "Beer" },
  { id: "wine", label: "Wine" },
  { id: "spirits", label: "Spirits" },
  { id: "tobacco", label: "Tobacco" },
  { id: "cigarettes", label: "Cigarettes" },
  { id: "cigars", label: "Cigars" },
  { id: "vape", label: "Vape products" },
  { id: "nicotine", label: "Nicotine products" },
  { id: "lottery", label: "Lottery" },
  { id: "other", label: "Other age-restricted" },
];

const STORAGE_KEY = "pos.prefs.age_verification";

export function loadAgeSettings(): AgeVerificationSettings {
  if (typeof window === "undefined") return DEFAULT_AGE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AGE_SETTINGS,
      ...parsed,
      categoryMinAges: {
        ...DEFAULT_AGE_SETTINGS.categoryMinAges,
        ...(parsed.categoryMinAges ?? {}),
      },
    };
  } catch {
    return DEFAULT_AGE_SETTINGS;
  }
}

export function saveAgeSettings(s: AgeVerificationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/** Compute age in whole years at a reference date. */
export function ageAt(dob: Date, at: Date = new Date()): number {
  let years = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) years--;
  return years;
}

/** Parses AAMVA MMDDYYYY / YYYYMMDD dates that appear in DL barcodes. */
function parseAamvaDate(v?: string): Date | undefined {
  if (!v) return;
  const s = v.replace(/\D/g, "");
  if (s.length !== 8) return;
  // Version 1: YYYYMMDD (Canada), Version 2+: MMDDCCYY (US)
  const y1 = parseInt(s.slice(0, 4), 10);
  const y2 = parseInt(s.slice(4, 8), 10);
  let year: number, month: number, day: number;
  if (y1 >= 1900 && y1 <= 2100 && y2 <= 1231) {
    year = y1;
    month = parseInt(s.slice(4, 6), 10);
    day = parseInt(s.slice(6, 8), 10);
  } else {
    month = parseInt(s.slice(0, 2), 10);
    day = parseInt(s.slice(2, 4), 10);
    year = parseInt(s.slice(4, 8), 10);
  }
  if (!month || !day || !year) return;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parse a scanned barcode string. Returns a ParsedID with format="unknown"
 * if the string isn't a recognizable AAMVA payload.
 */
export function parseIdBarcode(raw: string): ParsedID {
  // PDF417 scanners may send control characters, group separators, or one long
  // line instead of preserving the printed AAMVA newlines. Normalize all of
  // those forms before looking for fields.
  const original = raw || "";
  const s = Array.from(original)
    .map((character) => {
      const code = character.charCodeAt(0);

      // PDF417/AAMVA separators become line breaks.
      if (code >= 0x1c && code <= 0x1f) return "\n";

      // Keep tabs, line breaks, carriage returns, and printable characters.
      if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
        return character;
      }

      // Remove unsupported control characters.
      return "";
    })
    .join("")
    .replace(/\r/g, "\n");
  const coreFieldCount = (s.match(/D(?:AQ|CS|AC|CT|AD|BB|BA)/gi) ?? []).length;
  const isAamva = /ANSI\s*\d{6}/i.test(s) || coreFieldCount >= 2;
  if (!isAamva) return { format: "unknown", raw: original };

  const field = (code: string): string | undefined => {
    // Capture until the next AAMVA three-letter field, a newline, or end. This
    // supports scanners that collapse the complete ID payload onto one line.
    const re = new RegExp(
      `${code}\\s*([\\s\\S]*?)(?=(?:D[ABCD][A-Z]|Z[A-Z0-9]{2})|\\n|$)`,
      "i",
    );
    const value = s.match(re)?.[1]?.trim();
    return value || undefined;
  };

  const dobRaw = field("DBB");
  const expRaw = field("DBA");
  const first = field("DAC") ?? field("DCT");
  const last = field("DCS");
  const middle = field("DAD");
  const doc = field("DAQ");
  const fullFromDaa = field("DAA");
  const composed = [first, middle, last].filter(Boolean).join(" ").trim();
  const fullName = fullFromDaa ?? (composed || undefined);

  return {
    format: "aamva",
    firstName: first,
    lastName: last,
    middleName: middle,
    fullName,
    dob: parseAamvaDate(dobRaw),
    expires: parseAamvaDate(expRaw),
    documentNumber: doc,
    raw: original,
  };
}

export function maskDocumentNumber(doc?: string): string | undefined {
  if (!doc) return undefined;
  const clean = doc.replace(/\s+/g, "");
  if (clean.length <= 4) return "•".repeat(Math.max(0, clean.length - 1)) + clean.slice(-1);
  return "•".repeat(clean.length - 4) + clean.slice(-4);
}

export function maskFullName(name?: string): string | undefined {
  if (!name) return undefined;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0)}.`;
}

export type VerificationOutcome =
  | { ok: true; ageYears: number }
  | { ok: false; reason: "underage" | "expired_id" | "invalid_dob"; ageYears?: number };

export function evaluateId(
  parsed: ParsedID,
  minAge: number,
  now: Date = new Date(),
): VerificationOutcome {
  if (!parsed.dob) return { ok: false, reason: "invalid_dob" };
  if (parsed.expires && parsed.expires.getTime() < now.getTime()) {
    return { ok: false, reason: "expired_id", ageYears: ageAt(parsed.dob, now) };
  }
  const years = ageAt(parsed.dob, now);
  if (years < minAge) return { ok: false, reason: "underage", ageYears: years };
  return { ok: true, ageYears: years };
}

export function evaluateManualDob(
  dobIso: string,
  minAge: number,
  now: Date = new Date(),
): VerificationOutcome {
  const dob = new Date(dobIso + "T00:00:00Z");
  if (isNaN(dob.getTime())) return { ok: false, reason: "invalid_dob" };
  const years = ageAt(dob, now);
  if (years < minAge) return { ok: false, reason: "underage", ageYears: years };
  return { ok: true, ageYears: years };
}
