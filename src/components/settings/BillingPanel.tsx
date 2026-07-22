import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, CreditCard, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, type PlanTier } from "@/hooks/useSubscription";
import { StripeCheckoutDialog } from "@/components/billing/StripeCheckoutDialog";
import { createBillingPortalSession } from "@/lib/billing/checkout.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { SEZA_PLANS } from "@/lib/plans";

const TIER_LABEL: Record<PlanTier, string> = {
  expired: "Expired",
  starter: "Starter",
  pro: "Pro",
  trial_pro: "Free trial (Pro features)",
  business: "Business",
};


export function BillingPanel() {
  const { data: plan, isLoading } = useSubscription();
  const [checkout, setCheckout] = useState<{ priceId: string; name: string } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const paymentsOn = isPaymentsConfigured();

  const openCheckout = (priceId: string, name: string) => {
    if (!paymentsOn) {
      toast.error("Payments are not configured for this build.");
      return;
    }
    setCheckout({ priceId, name });
  };

  const openPortal = async () => {
    if (!paymentsOn) {
      toast.error("Payments are not configured for this build.");
      return;
    }
    try {
      setPortalLoading(true);
      const result = await createBillingPortalSession({
        data: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/settings`,
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  if (isLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;

  const isTrialing = plan?.isTrialing;
  const isReadOnly = plan?.isReadOnly;
  const hasPaidPlan = plan?.tier && plan.tier !== "trial_pro" && plan.tier !== "expired";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Current plan
              </CardTitle>
              <CardDescription>Your SEZA POS subscription details.</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={isReadOnly ? "destructive" : isTrialing ? "secondary" : "default"}>
                {TIER_LABEL[plan?.tier ?? "expired"]}
              </Badge>
              {isReadOnly && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Read-only mode
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan?.periodEnd && (
            <div className="text-sm text-muted-foreground">
              {isTrialing
                ? `Trial ends ${format(plan.periodEnd, "PPP")}`
                : plan.cancelAtPeriodEnd
                ? `Access ends ${format(plan.periodEnd, "PPP")} (cancellation scheduled)`
                : `Renews ${format(plan.periodEnd, "PPP")}`}
              {plan.daysLeft != null && ` — ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left`}
            </div>
          )}

          {hasPaidPlan && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                Manage subscription
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{hasPaidPlan ? "Change plan" : "Choose a plan"}</CardTitle>
          <CardDescription>
            {hasPaidPlan
              ? "Upgrade or downgrade at any time — changes take effect immediately."
              : "Subscribe to keep using SEZA POS after your trial ends."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {SEZA_PLANS.map((p) => {
            const isCurrent = plan?.tier === p.id;
            return (
              <div key={p.id} className={`rounded-lg border p-4 ${isCurrent ? "border-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  {isCurrent && <Badge variant="outline">Current</Badge>}
                </div>
                <div className="mt-2 text-2xl font-bold">
                  ${p.monthlyPrice}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </div>
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent}
                  onClick={() => openCheckout(p.lookupKey, p.name)}
                >
                  {isCurrent ? "Current plan" : hasPaidPlan ? "Switch" : "Subscribe"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

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
