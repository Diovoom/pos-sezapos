import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/hooks/useSession";
import { useSubscription } from "@/hooks/useSubscription";
import { StripeCheckoutDialog } from "@/components/billing/StripeCheckoutDialog";

export const Route = createFileRoute("/select-plan")({
  head: () => ({
    meta: [
      { title: "Choose your plan — SEZA POS" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SelectPlanPage,
});

const PLANS = [
  {
    id: "starter" as const,
    name: "Starter",
    price: 29,
    priceId: "starter_monthly",
    tagline: "1 register, up to 2 employees",
    features: ["Cash + card checkout", "Basic inventory", "Email receipts"],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: 59,
    priceId: "pro_monthly",
    tagline: "Growing retail stores",
    highlight: true,
    features: ["Everything in Starter", "Up to 10 employees", "SMS receipts", "Advanced reports"],
  },
  {
    id: "business" as const,
    name: "Business",
    price: 89,
    priceId: "business_monthly",
    tagline: "High-volume & multi-store",
    features: ["Everything in Pro", "Unlimited employees", "Multi-store", "API access"],
  },
];

function SelectPlanPage() {
  const navigate = useNavigate();
  const { session, loading: sessLoading } = useSession();
  const { data: plan } = useSubscription();
  const [checkout, setCheckout] = useState<{ priceId: string; name: string } | null>(null);

  useEffect(() => {
    if (!sessLoading && !session) navigate({ to: "/signup", replace: true });
  }, [session, sessLoading, navigate]);

  useEffect(() => {
    if (plan && plan.tier !== "trial_pro" && plan.tier !== "expired") {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [plan, navigate]);

  return (
    <div className="min-h-screen bg-surface p-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <ShieldCheck className="h-10 w-10 text-primary mx-auto" />
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Choose your plan</h1>
          <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
            Subscribe now, or continue your 14-day free trial and subscribe before it ends.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card
              key={p.id}
              className={
                p.highlight ? "border-primary shadow-lg ring-1 ring-primary/20 relative" : ""
              }
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.tagline}</CardDescription>
                <div className="mt-2">
                  <span className="text-3xl font-bold">${p.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={p.highlight ? "default" : "outline"}
                  onClick={() => setCheckout({ priceId: p.priceId, name: p.name })}
                >
                  Subscribe to {p.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Secure payment. Cancel anytime from Settings → Billing.
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Skip for now — continue on trial</Link>
          </Button>
        </div>
      </div>

      {checkout && (
        <StripeCheckoutDialog
          open={!!checkout}
          onOpenChange={(o) => !o && setCheckout(null)}
          priceId={checkout.priceId}
          planName={checkout.name}
        />
      )}
    </div>
  );
}
