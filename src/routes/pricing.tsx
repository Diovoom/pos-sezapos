import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SEZA POS" },
      { name: "description", content: "Simple, transparent pricing for SEZA POS. Starter $29, Pro $59, Business $89. 14-day free trial." },
      { property: "og:title", content: "Pricing — SEZA POS" },
      { property: "og:description", content: "Three plans for retail businesses of every size. Start with a 14-day free trial." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/pricing" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/pricing" }],
  }),
  component: PricingPage,
});

type Plan = {
  id: "starter" | "pro" | "business";
  name: string;
  price: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    tagline: "Small shops, solo owners, new businesses",
    features: [
      "1 register",
      "Up to 2 employees",
      "Cash + card checkout",
      "Barcode scanning",
      "Basic inventory tracking",
      "Email receipts",
      "Daily & weekly sales reports",
      "Receipt printer support",
      "Cloud backup",
      "Standard support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 59,
    tagline: "Growing retail stores",
    highlight: true,
    features: [
      "Everything in Starter",
      "Up to 10 employees",
      "Multiple registers",
      "Advanced inventory (alerts, variants)",
      "Roles & permissions",
      "Shift tracking (clock in/out)",
      "Refunds & exchanges",
      "SMS receipts",
      "Advanced reporting",
      "Customer profiles",
      "Priority support",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 89,
    tagline: "High-volume & multi-store businesses",
    features: [
      "Everything in Pro",
      "Unlimited employees",
      "Unlimited registers",
      "Multi-store ready",
      "Advanced analytics",
      "Full audit logs",
      "Custom tax rules by region",
      "Offline mode",
      "API access",
      "Plugin marketplace",
      "Dedicated onboarding",
    ],
  },
];

function PricingPage() {
  const { session } = useSession();

  const handleChoose = (planName: string) => {
    if (!session) {
      window.location.href = `/signup`;
      return;
    }
    toast.info(`${planName} selected. Billing provider not configured yet — Stripe integration coming soon.`);
  };

  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">Simple pricing for every store</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Start with a 14-day free trial. No credit card required during preview — payments are not yet processed.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 flex flex-col ${
                plan.highlight ? "border-primary shadow-lg ring-1 ring-primary/20 relative" : ""
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-semibold">{plan.name}</h3>
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
              </ul>
              <Button
                className="mt-6 w-full"
                variant={plan.highlight ? "default" : "outline"}
                onClick={() => handleChoose(plan.name)}
              >
                {session ? `Choose ${plan.name}` : "Start Free Trial"}
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Prices in USD. Need something custom?{" "}
          <Link to="/contact" className="text-primary hover:underline">Contact us</Link>.
        </p>
      </section>
    </MarketingShell>
  );
}
