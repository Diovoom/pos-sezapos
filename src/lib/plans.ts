export type SezaPlanId = "starter" | "pro" | "business";
export type SezaEffectiveTier = SezaPlanId | "trial_pro" | "expired";

export type SezaFeatureKey =
  | "core_pos"
  | "inventory"
  | "customer_loyalty"
  | "sms_receipts"
  | "low_stock_alerts"
  | "receipts"
  | "offline_sales"
  | "hardware_setup"
  | "basic_reports"
  | "team_permissions"
  | "payroll"
  | "audit_history";

export type SezaPlanLimits = {
  employees: number | null;
  registers: number | null;
};

export type SezaPlan = {
  id: SezaPlanId;
  name: "Starter" | "Pro" | "Business";
  monthlyPrice: number;
  monthlyPriceCents: number;
  lookupKey: `${SezaPlanId}_monthly`;
  tagline: string;
  highlight?: boolean;
  limits: SezaPlanLimits;
  features: string[];
};

/**
 * The plan catalog is the single source of truth for public pricing, signup,
 * billing, and application entitlements. Do not duplicate plan copy elsewhere.
 *
 * Only capabilities that are available in the maintained SEZA product today
 * are advertised here. Future features should be added only when the product
 * path and entitlement enforcement both exist.
 */
export const SEZA_PLANS: readonly SezaPlan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    monthlyPriceCents: 2900,
    lookupKey: "starter_monthly",
    tagline: "A complete first register for owner-operated stores.",
    limits: { employees: 2, registers: 1 },
    features: [
      "1 POS register",
      "Up to 2 employees",
      "Cash, card and split checkout",
      "Products and inventory",
      "Barcode scanning",
      "Printed and email receipts",
      "Customer profiles",
      "Shift, cash drawer and safe-drop controls",
      "Sales, tax and product reports",
      "Offline cash sales with automatic sync",
      "Customer display and hardware setup",
      "Standard support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 59,
    monthlyPriceCents: 5900,
    lookupKey: "pro_monthly",
    tagline: "For growing stores with a larger team and more registers.",
    highlight: true,
    limits: { employees: 10, registers: 3 },
    features: [
      "Everything in Starter",
      "Up to 10 employees",
      "Up to 3 POS registers",
      "SMS receipts",
      "Low-stock alerts",
      "Customer loyalty and rewards",
      "Custom roles and permission controls",
      "Payroll and labor reporting",
      "Multi-register device management",
      "Priority support",
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 89,
    monthlyPriceCents: 8900,
    lookupKey: "business_monthly",
    tagline: "For high-volume operations that need unrestricted scale and oversight.",
    limits: { employees: null, registers: null },
    features: [
      "Everything in Pro",
      "Unlimited employees",
      "Unlimited POS registers",
      "Merchant audit log access",
      "Dedicated onboarding",
      "Business-priority support",
    ],
  },
] as const;

export const SEZA_PLAN_BY_ID = Object.fromEntries(
  SEZA_PLANS.map((plan) => [plan.id, plan]),
) as Record<SezaPlanId, SezaPlan>;

export const SEZA_PLAN_PRICE_CENTS = Object.fromEntries(
  SEZA_PLANS.map((plan) => [plan.id, plan.monthlyPriceCents]),
) as Record<SezaPlanId, number>;

export const SEZA_PLAN_LOOKUP_PRICE_CENTS = Object.fromEntries(
  SEZA_PLANS.map((plan) => [plan.lookupKey, plan.monthlyPriceCents]),
) as Record<string, number>;

export const SEZA_FEATURE_MIN_TIER: Record<SezaFeatureKey, SezaPlanId> = {
  core_pos: "starter",
  inventory: "starter",
  customer_loyalty: "pro",
  sms_receipts: "pro",
  low_stock_alerts: "pro",
  receipts: "starter",
  offline_sales: "starter",
  hardware_setup: "starter",
  basic_reports: "starter",
  team_permissions: "pro",
  payroll: "pro",
  audit_history: "business",
};

const PLAN_RANK: Record<SezaPlanId, number> = {
  starter: 1,
  pro: 2,
  business: 3,
};

export function normalizeEffectiveTier(tier: SezaEffectiveTier | null | undefined): SezaPlanId | null {
  if (tier === "trial_pro") return "pro";
  if (tier === "starter" || tier === "pro" || tier === "business") return tier;
  return null;
}

export function planForTier(tier: SezaEffectiveTier | null | undefined): SezaPlan | null {
  const normalized = normalizeEffectiveTier(tier);
  return normalized ? SEZA_PLAN_BY_ID[normalized] : null;
}

export function tierIncludesFeature(
  tier: SezaEffectiveTier | null | undefined,
  feature: SezaFeatureKey,
): boolean {
  const normalized = normalizeEffectiveTier(tier);
  if (!normalized) return false;
  const required = SEZA_FEATURE_MIN_TIER[feature];
  return PLAN_RANK[normalized] >= PLAN_RANK[required];
}

export function planLimit(
  tier: SezaEffectiveTier | null | undefined,
  key: keyof SezaPlanLimits,
): number | null {
  return planForTier(tier)?.limits[key] ?? 0;
}

export function formatPlanLimit(value: number | null): string {
  return value == null ? "Unlimited" : String(value);
}
