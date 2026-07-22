import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";

const pricingSearch = z.object({
  plan: z.enum(["starter", "pro", "business"]).optional(),
});

export const Route = createFileRoute("/pricing")({
  validateSearch: pricingSearch,
  head: () => ({
    meta: [
      { title: "Pricing — SEZA POS" },
      { name: "description", content: "Simple pricing for SEZA POS. Starter $29, Pro $59, Business $89. 14-day free trial. No credit card required. Cancel anytime." },
      { property: "og:title", content: "Simple pricing. Start free, choose later. — SEZA POS" },
      { property: "og:description", content: "Three plans for retail businesses of every size. Start with a 14-day free trial. No credit card required." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/pricing" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/pricing" }],
  }),
  component: PricingPage,
});

type PlanId = "starter" | "pro" | "business";

type Plan = {
  id: PlanId;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  comingSoon?: string[];
  highlight?: boolean;
  cta: string;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    tagline: "For owner-operated shops.",
    cta: "Start Starter trial",
    features: [
      "1 register",
      "Up to 2 employees",
      "Cash + card checkout",
      "Barcode scanning",
      "Basic inventory tracking",
      "Email receipts",
      "Daily & weekly sales reports",
      "Receipt printer support",
      "Cloud-synced store data",
      "Standard support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 59,
    tagline: "For growing retail stores.",
    highlight: true,
    cta: "Start Pro trial",
    features: [
      "Everything in Starter",
      "Up to 10 employees",
      "Multiple registers",
      "Advanced inventory (alerts, variants)",
      "Roles & permissions",
      "Shift tracking (clock in/out)",
      "Refunds & exchanges",
      "Customer profiles",
      "Advanced reporting",
      "Priority support",
    ],
    comingSoon: ["SMS receipts"],
  },
  {
    id: "business",
    name: "Business",
    price: 89,
    tagline: "For high-volume or multi-store businesses.",
    cta: "Start Business trial",
    features: [
      "Everything in Pro",
      "Unlimited employees",
      "Unlimited registers",
      "Full audit logs",
      "Custom tax rules by region",
      "Dedicated onboarding",
    ],
    comingSoon: ["Multi-store management", "Offline mode", "API access", "Plugin marketplace"],
  },
];

function PricingPage() {
  const search = useSearch({ from: "/pricing" });
  const selectedPlan = search.plan;

  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Simple pricing. Start free, choose later.</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Try SEZA for 14 days with the tools you need to test your store. No credit card required. Choose the plan that best fits your business—you can change it before billing begins.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-6 flex flex-col ${
                  plan.highlight
                    ? "border-primary shadow-lg ring-1 ring-primary/20 relative"
                    : isSelected
                    ? "border-primary/60 ring-1 ring-primary/10"
                    : ""
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{plan.tagline}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {plan.comingSoon?.map((f) => (
                    <li key={f} className="flex gap-2 text-muted-foreground">
                      <span className="h-4 w-4 shrink-0 mt-0.5 rounded-full border border-dashed" aria-hidden />
                      <span>{f} <span className="text-[10px] uppercase tracking-wide font-semibold ml-1 text-muted-foreground/80">Coming soon</span></span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6 w-full" variant={plan.highlight ? "default" : "outline"}>
                  <Link to="/signup" search={{ plan: plan.id }}>{plan.cta}</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          14-day free trial. No credit card required. Cancel anytime. Prices in USD.{" "}
          <Link to="/contact" className="text-primary hover:underline">Need something custom?</Link>
        </p>
      </section>
    </MarketingShell>
  );
}
