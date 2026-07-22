export type SezaPlanId = "starter" | "pro" | "business";

export type SezaPlan = {
  id: SezaPlanId;
  name: "Starter" | "Pro" | "Business";
  monthlyPrice: number;
  monthlyPriceCents: number;
  lookupKey: `${SezaPlanId}_monthly`;
  tagline: string;
  highlight?: boolean;
  features: string[];
};

export const SEZA_PLANS: readonly SezaPlan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    monthlyPriceCents: 2900,
    lookupKey: "starter_monthly",
    tagline: "For owner-operated shops getting started.",
    features: [
      "1 register",
      "Up to 2 employees",
      "Cash, card and split checkout",
      "Barcode and camera scanning",
      "Inventory and low-stock alerts",
      "Email and SMS receipts",
      "Customer profiles and loyalty",
      "Shift, cash drawer and payout controls",
      "Sales, tax and product reports",
      "Offline cash sales with automatic sync",
      "Hardware setup workspace",
      "Standard support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 59,
    monthlyPriceCents: 5900,
    lookupKey: "pro_monthly",
    tagline: "For growing stores and restaurant teams.",
    highlight: true,
    features: [
      "Everything in Starter",
      "Up to 10 employees",
      "Multiple registers",
      "Advanced inventory, variants and modifiers",
      "Roles, permissions and manager approvals",
      "Restaurant order, table and kitchen workflows",
      "Refunds, exchanges and split tender",
      "Advanced labor and operational reporting",
      "Stripe Terminal and Tap to Pay setup",
      "Public API key management",
      "Priority support",
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 89,
    monthlyPriceCents: 8900,
    lookupKey: "business_monthly",
    tagline: "For high-volume and multi-location businesses.",
    features: [
      "Everything in Pro",
      "Unlimited employees",
      "Unlimited registers",
      "Multi-location management",
      "Full immutable audit history",
      "Custom tax and regional configuration",
      "API and integration controls",
      "Advanced offline operations and sync monitoring",
      "Dedicated onboarding",
      "Business-priority support",
    ],
  },
] as const;

export const SEZA_PLAN_BY_ID = Object.fromEntries(
  SEZA_PLANS.map((plan) => [plan.id, plan]),
) as Record<SezaPlanId, SezaPlan>;

export const SEZA_PLAN_PRICE_CENTS: Record<SezaPlanId, number> = {
  starter: 2900,
  pro: 5900,
  business: 8900,
};

export const SEZA_PLAN_LOOKUP_PRICE_CENTS: Record<string, number> = {
  starter_monthly: 2900,
  pro_monthly: 5900,
  business_monthly: 8900,
};
