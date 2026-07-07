import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, CreditCard, AlertTriangle, Info, FileText, RefreshCw, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, type PlanTier } from "@/hooks/useSubscription";

const TIER_LABEL: Record<PlanTier, string> = {
  expired: "Expired",
  starter: "Starter",
  pro: "Pro",
  trial_pro: "Free trial (Pro features)",
  business: "Business",
};

const PLANS = [
  { id: "starter" as const, name: "Starter", price: 29, tier: "starter" as PlanTier },
  { id: "pro" as const, name: "Pro", price: 59, tier: "pro" as PlanTier },
  { id: "business" as const, name: "Business", price: 89, tier: "business" as PlanTier },
];

const notConfigured = () =>
  toast.info("Billing provider not configured yet. Stripe integration coming soon.");

export function BillingPanel() {
  const { data: plan, isLoading } = useSubscription();

  if (isLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;

  const isTrialing = plan?.isTrialing;
  const isReadOnly = plan?.isReadOnly;

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

          <div className="rounded-md border border-dashed bg-muted/40 p-4 flex gap-3 items-start">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Billing provider not configured yet.</p>
              <p className="text-muted-foreground">
                Stripe integration is coming soon. No real payments will be processed until it's connected.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={notConfigured}>
              <CreditCard className="h-4 w-4 mr-2" /> Connect Stripe
            </Button>
            <Button variant="outline" onClick={notConfigured}>
              <Settings2 className="h-4 w-4 mr-2" /> Manage Subscription
            </Button>
            <Button variant="outline" onClick={notConfigured}>
              <FileText className="h-4 w-4 mr-2" /> View Invoices
            </Button>
            <Button variant="outline" onClick={notConfigured}>
              <RefreshCw className="h-4 w-4 mr-2" /> Update Payment Method
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available plans</CardTitle>
          <CardDescription>Choose a plan once billing is configured.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = plan && plan.tier !== "trial_pro" && plan.tier === p.tier;
            return (
              <div key={p.id} className={`rounded-lg border p-4 ${isCurrent ? "border-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  {isCurrent && <Badge variant="outline">Current</Badge>}
                </div>
                <div className="mt-2 text-2xl font-bold">
                  ${p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </div>
                <Button className="mt-4 w-full" size="sm" variant="outline" onClick={notConfigured}>
                  {isCurrent ? "Current plan" : "Choose"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
