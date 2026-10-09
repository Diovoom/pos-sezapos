import { isDisposableEmail } from "@/lib/security/disposable-email";
import { LEGAL_CONFIG } from "@/lib/legal/config";
export type WizardState = {
  step: number;
  owner: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    accepted_terms: boolean;
    legal_accepted_at: string | null;
    terms_version: string | null;
    privacy_version: string | null;
  };
  store: {
    name: string;
    business_type: string;
    tax_id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    logo_url: string;
    hours: string;
  };
  tax: {
    rate: number;
    inclusive: boolean;
    currency: string;
    currency_symbol: string;
    time_zone: string;
    date_format: string;
    language: string;
  };
  receipt: {
    logo_url: string;
    header: string;
    footer: string;
    return_policy: string;
    thank_you: string;
    qr_url: string;
    website: string;
    social: { facebook: string; instagram: string; twitter: string };
  };
  employee: {
    skip: boolean;
    first_name: string;
    last_name: string;
    role: "cashier" | "manager";
    email: string;
    phone: string;
  };
  products: {
    mode: "manual" | "import" | "skip";
    items: { name: string; price: number; sku: string; stock: number }[];
    csv: string;
  };
  hardware: {
    printer: boolean;
    scanner: boolean;
    drawer: boolean;
    display: boolean;
    terminal: boolean;
  };
  payments: { provider: "cash_only" | "stripe" | "square" | "clover" };
  test_sale: { added: boolean; scanned: boolean; paid: boolean; printed: boolean };
};

export const DEFAULT_STATE = (): WizardState => ({
  step: 0,
  owner: {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    accepted_terms: false,
    legal_accepted_at: null,
    terms_version: null,
    privacy_version: null,
  },
  store: {
    name: "",
    business_type: "convenience",
    tax_id: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: "",
    email: "",
    website: "",
    logo_url: "",
    hours: "Mon–Sun 8:00–22:00",
  },
  tax: {
    rate: 0,
    inclusive: false,
    currency: "USD",
    currency_symbol: "$",
    time_zone: "America/New_York",
    date_format: "MM/DD/YYYY",
    language: "en",
  },
  receipt: {
    logo_url: "",
    header: "",
    footer: "Thank you for shopping with us!",
    return_policy: "Returns accepted within 14 days with receipt.",
    thank_you: "Have a great day!",
    qr_url: "",
    website: "",
    social: { facebook: "", instagram: "", twitter: "" },
  },
  employee: { skip: true, first_name: "", last_name: "", role: "cashier", email: "", phone: "" },
  products: { mode: "skip", items: [], csv: "" },
  hardware: { printer: false, scanner: false, drawer: false, display: false, terminal: false },
  payments: { provider: "cash_only" },
  test_sale: { added: false, scanned: false, paid: false, printed: false },
});

export const normalizeKey = (v: string) => v.trim().toLocaleLowerCase("en-US");
export type SetupProduct = WizardState["products"]["items"][number];
export function parseSetupCsv(csv: string): SetupProduct[] {
  if (csv.length > 300_000)
    throw new Error("Use a CSV with at most 500 products and 300 KB of text.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const source = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error("Check the quotation marks in your CSV.");
      quoted = true;
    } else if (c === ",") {
      row.push(cell.trim());
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && c.trim()) throw new Error("Check the commas after quoted CSV values.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error("Close the quotation marks in your CSV.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift()!.map(normalizeKey);
  if (
    new Set(headers).size !== headers.length ||
    !headers.includes("name") ||
    !headers.includes("price")
  )
    throw new Error("CSV must include name and price headers. SKU and stock are optional.");
  if (headers.some((h) => !["name", "sku", "price", "stock"].includes(h)))
    throw new Error("Use only these CSV headers: name, sku, price, stock.");
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`Check the columns on CSV row ${i + 2}.`);
    const at = (key: string) => cells[headers.indexOf(key)] ?? "";
    if (
      !/^\d+(?:\.\d+)?$/.test(at("price")) ||
      (at("stock") && !/^\d+(?:\.\d+)?$/.test(at("stock")))
    )
      throw new Error(`Enter a price on CSV row ${i + 2}.`);
    return {
      name: at("name"),
      sku: at("sku"),
      price: Number(at("price")),
      stock: at("stock") ? Number(at("stock")) : 0,
    };
  });
}
export function setupProducts(state: WizardState): SetupProduct[] {
  if (state.products.mode === "skip") return [];
  const rows =
    state.products.mode === "import" ? parseSetupCsv(state.products.csv) : state.products.items;
  if (!rows.length) throw new Error("Add a product or choose Skip.");
  if (rows.length > 500) throw new Error("Import at most 500 products during setup.");
  const seen = new Set<string>();
  return rows.map((p, i) => {
    const item = { ...p, name: p.name.trim(), sku: p.sku.trim() };
    if (!item.name || item.name.length > 200 || item.sku.length > 100)
      throw new Error(`Check the name and SKU for product ${i + 1}.`);
    if (
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      item.price > 999999.99 ||
      Math.abs(item.price * 100 - Math.round(item.price * 100)) > 0.00001
    )
      throw new Error(`Enter a valid price with up to two decimals for product ${i + 1}.`);
    if (!Number.isFinite(item.stock) || item.stock < 0 || item.stock > 1000000000)
      throw new Error(`Enter a valid stock quantity for product ${i + 1}.`);
    const key = item.sku ? `sku:${normalizeKey(item.sku)}` : `name:${normalizeKey(item.name)}`;
    if (seen.has(key))
      throw new Error(`Product ${i + 1} repeats a name or SKU. Remove the duplicate row.`);
    seen.add(key);
    return item;
  });
}
const email = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const web = (v: string) => {
  try {
    return !v || ["https:", "http:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};
export function validateSetupStep(s: WizardState, step: number): string | null {
  if (step === 1) {
    if (!s.owner.first_name.trim() || !s.owner.last_name.trim())
      return "Enter your first and last name.";
    if (isDisposableEmail(s.owner.email))
      return "Use a permanent account email address. Update it in your profile before continuing.";
    if (!email(s.owner.email)) return "Use a valid account email address.";
    if (
      !s.owner.accepted_terms ||
      s.owner.terms_version !== LEGAL_CONFIG.termsVersion ||
      s.owner.privacy_version !== LEGAL_CONFIG.privacyVersion
    )
      return "Accept the current Terms of Service and Privacy Policy.";
  }
  if (step === 2) {
    if (!s.store.name.trim()) return "Enter your store name.";
    if (!/^[A-Z]{2}$/.test(s.store.country)) return "Select your store’s country.";
    if (s.store.email && !email(s.store.email)) return "Enter a valid store email address.";
    if (!web(s.store.website)) return "Enter a website starting with https:// or http://.";
  }
  if (step === 3) {
    if (!Number.isFinite(s.tax.rate) || s.tax.rate < 0 || s.tax.rate > 100)
      return "Enter a tax rate from 0 to 100%.";
    if (!/^[A-Z]{3}$/.test(s.tax.currency))
      return "Enter a three-letter currency code, such as USD.";
    const currencies = (Intl as any).supportedValuesOf?.("currency") as string[] | undefined;
    if (currencies && !currencies.includes(s.tax.currency))
      return "Choose a supported currency code.";
    try {
      new Intl.DateTimeFormat("en", { timeZone: s.tax.time_zone });
    } catch {
      return "Enter a valid time zone, such as America/New_York.";
    }
    try {
      Intl.getCanonicalLocales(s.tax.language);
      if (!s.tax.language) throw new Error();
    } catch {
      return "Enter a valid language code, such as en or es.";
    }
    if (
      ![
        "MM/DD/YYYY",
        "DD/MM/YYYY",
        "YYYY-MM-DD",
        "dd/MM/yyyy",
        "MM/dd/yyyy",
        "yyyy-MM-dd",
      ].includes(s.tax.date_format)
    )
      return "Choose a supported date format.";
    if (!s.tax.currency_symbol.trim()) return "Enter the currency symbol.";
  }
  if (step === 5 && !s.employee.skip) {
    if (!s.employee.first_name.trim() || !s.employee.last_name.trim())
      return "Enter the employee’s first and last name.";
    if (!email(s.employee.email)) return "Enter a valid employee email address.";
    if (normalizeKey(s.employee.email) === normalizeKey(s.owner.email))
      return "Use the employee’s own email address, not your owner email.";
    if (!["cashier", "manager"].includes(s.employee.role))
      return "Choose Cashier or Manager for the employee.";
  }
  if (step === 6 && !["manual", "import", "skip"].includes(s.products.mode))
    return "Choose how to add products.";
  if (step === 6) {
    try {
      setupProducts(s);
    } catch (e) {
      return (e as Error).message;
    }
  }
  return null;
}
export function validateSetup(s: WizardState) {
  for (const step of [1, 2, 3, 4, 5, 6]) {
    const message = validateSetupStep(s, step);
    if (message) return { step, message };
  }
  return null;
}

export function hydrateSetup(
  store: any,
  profile: any,
  saved: Partial<WizardState> = {},
): WizardState {
  const d = DEFAULT_STATE();
  const pick = (key: string, fallback: any = "") => store[key] ?? fallback;
  return {
    ...d,
    ...saved,
    owner: {
      ...d.owner,
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      phone: profile.phone ?? "",
      ...saved.owner,
      email: profile.email ?? "",
    },
    store: {
      ...d.store,
      ...Object.fromEntries(
        Object.keys(d.store)
          .filter((k) => k !== "hours")
          .map((k) => [k, pick(k, (d.store as any)[k])]),
      ),
      hours: store.business_hours?.text ?? d.store.hours,
      ...saved.store,
    },
    tax: {
      ...d.tax,
      rate: store.tax_rate != null ? Number(store.tax_rate) * 100 : 0,
      inclusive: pick("tax_inclusive", false),
      currency: pick("currency", "USD"),
      currency_symbol: pick("currency_symbol", "$"),
      time_zone: pick("time_zone", "America/New_York"),
      date_format: pick("date_format", "MM/DD/YYYY"),
      language: pick("language", "en"),
      ...saved.tax,
    },
    receipt: {
      ...d.receipt,
      logo_url: pick("receipt_logo_url"),
      header: pick("receipt_header"),
      footer: pick("receipt_footer", d.receipt.footer),
      return_policy: pick("return_policy", d.receipt.return_policy),
      thank_you: pick("thank_you_message", d.receipt.thank_you),
      ...saved.receipt,
      social: { ...d.receipt.social, ...store.social_links, ...saved.receipt?.social },
    },
    employee: { ...d.employee, ...saved.employee },
    products: { ...d.products, ...saved.products },
    hardware: { ...d.hardware, ...saved.hardware },
    payments: {
      provider:
        saved.payments?.provider === "stripe" || store.stripe_connected_account_id
          ? "stripe"
          : "cash_only",
    },
    test_sale: { ...d.test_sale, ...saved.test_sale },
    step: store.setup_completed_at ? 11 : Math.max(0, Math.min(10, Number(saved.step) || 0)),
  };
}
export function setupStorePatch(s: WizardState, current: any) {
  return {
    ...Object.fromEntries(
      Object.entries(s.store)
        .filter(([k]) => k !== "hours")
        .map(([k, v]) => [k, v.trim() || null]),
    ),
    business_hours: { ...(current.business_hours ?? {}), text: s.store.hours },
    tax_rate: s.tax.rate / 100,
    tax_inclusive: s.tax.inclusive,
    currency: s.tax.currency,
    currency_symbol: s.tax.currency_symbol,
    time_zone: s.tax.time_zone,
    date_format: s.tax.date_format,
    language: s.tax.language,
    receipt_logo_url: s.receipt.logo_url || null,
    receipt_header: s.receipt.header || null,
    receipt_footer: s.receipt.footer || null,
    return_policy: s.receipt.return_policy || null,
    thank_you_message: s.receipt.thank_you || null,
    social_links: { ...(current.social_links ?? {}), ...s.receipt.social },
  };
}
export function setupError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "");
  if (
    [
      "Please wait a moment before saving again. Your draft is kept on this device.",
      "Setup changed in another tab. Reload to load the latest saved draft; your local draft is still kept.",
      "Setup is already being completed. Wait a moment, then try again.",
      "Your store session changed. Sign in again before continuing.",
    ].includes(message)
  )
    return message;
  if (/rate.?limit|too many|429/i.test(message))
    return "Please wait a moment before saving again. Your draft is kept on this device.";
  if (/SETUP_CONFLICT/.test(message))
    return "Setup changed in another tab. Reload to load the latest saved draft; your local draft is still kept.";
  if (/SETUP_BUSY/.test(message))
    return "Setup is already being completed. Wait a moment, then try again.";
  if (/SETUP_SCOPE/.test(message))
    return "Your store session changed. Sign in again before continuing.";
  // Server returns only these explicit business errors; never display arbitrary API text.
  if (
    /^(Enter |Choose |Select |Accept |Use |Add |Check |Import at most|Product \d|Remove |An employee|Employee invitation|The store plan)/.test(
      message,
    ) &&
    message.length < 180 &&
    !/secret|supabase|stripe|SQL|PGRST|\{/.test(message)
  )
    return message;
  return "Setup could not be saved. Your draft is kept on this device. Check your connection and try again.";
}

// Rebuild from the known schema. Unknown properties can never become store columns.
export function cleanSetup(input: unknown): WizardState {
  function clean(value: any, template: any, key: string): any {
    if (Array.isArray(template)) {
      if (!Array.isArray(value) || value.length > 500)
        throw new Error("Check your product list (maximum 500 rows).");
      return value.map((v) => clean(v, { name: "", price: 0, sku: "", stock: 0 }, "product"));
    }
    if (template === null) {
      if (value == null) return null;
      if (typeof value !== "string" || value.length > 100)
        throw new Error("Check your saved setup details.");
      return value;
    }
    if (typeof template === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
      return Object.fromEntries(
        Object.entries(template).map(([k, v]) => [k, clean(value[k] ?? v, v, k)]),
      );
    }
    if (typeof value !== typeof template || (typeof value === "number" && !Number.isFinite(value)))
      throw new Error("Check your setup values.");
    if (typeof value === "string" && value.length > (key === "csv" ? 300_000 : 2000))
      throw new Error("Use shorter setup values (CSV maximum 300 KB).");
    return value;
  }
  return clean(input, DEFAULT_STATE(), "setup");
}
