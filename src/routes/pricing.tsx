import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SEZA_PLANS } from "@/lib/plans";

const pricingSearch = z.object({
  plan: z.enum(["starter", "pro", "business"]).optional(),
});

export const Route = createFileRoute("/pricing")({
  validateSearch: pricingSearch,
  head: () => ({
    meta: [
      { title: "Pricing — SEZA POS" },
      {
        name: "description",
        content:
          "Simple pricing for SEZA POS. Starter $29, Pro $59, Business $89. 14-day free trial. No credit card required. Cancel anytime.",
      },
      { property: "og:title", content: "Simple pricing. Start free, choose later. — SEZA POS" },
      {
        property: "og:description",
        content:
          "Three plans for retail businesses of every size. Start with a 14-day free trial. No credit card required.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/pricing" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/pricing" }],
  }),
  component: PricingPage,
});

type PlanId = "starter" | "pro" | "business";

function PricingPage() {
  const search = useSearch({ from: "/pricing" });
  const selectedPlan = search.plan;

  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Simple pricing. Start free, choose later.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Try SEZA for 14 days with the tools you need to test your store. No credit card
            required. Choose the plan that best fits your business—you can change it before billing
            begins.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {SEZA_PLANS.map((plan) => {
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
                  <span className="text-4xl font-bold">${plan.monthlyPrice}</span>
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
                  asChild
                  className="mt-6 w-full"
                  variant={plan.highlight ? "default" : "outline"}
                >
                  <Link to="/signup" search={{ plan: plan.id }}>{`Start ${plan.name} trial`}</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          14-day free trial. No credit card required. Cancel anytime. Prices in USD.{" "}
          <Link to="/contact" className="text-primary hover:underline">
            Need something custom?
          </Link>
        </p>
      </section>
    </MarketingShell>
  );
}
