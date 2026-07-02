import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SEZA POS" },
      { name: "description", content: "Simple, transparent pricing for SEZA POS. Starter $29, Pro $59, Business $89. 14-day free trial, no credit card required." },
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
  id: "starter_monthly" | "pro_monthly" | "business_monthly";
  name: string;
  price: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter_monthly",
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
    id: "pro_monthly",
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
    id: "business_monthly",
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
  const { openCheckout, loading } = usePaddleCheckout();
  const { session } = useSession();

  const handleChoose = (planId: Plan["id"]) => {
    if (!session) {
      window.location.href = `/signup`;
      return;
    }
    openCheckout(planId);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">SEZA POS</Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/auth" className="text-muted-foreground hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">Simple pricing for every store</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Start with a 7-day free trial. No credit card required. Cancel anytime.
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
                disabled={loading}
                onClick={() => handleChoose(plan.id)}
              >
                {session ? `Choose ${plan.name}` : "Start Free Trial"}
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Payments are securely processed by Paddle, our Merchant of Record. Prices in USD.
        </p>
      </main>

      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap justify-center gap-6 text-xs text-muted-foreground">
          <Link to="/terms">Terms</Link>
          <Link to="/refund">Refund Policy</Link>
          <Link to="/privacy">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
