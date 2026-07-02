import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, ExternalLink, Sparkles, CreditCard, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSubscription, type PlanTier } from "@/hooks/useSubscription";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { createPortalSession, cancelSubscription, simulateTrialExpiry } from "@/utils/payments.functions";
import { getPaddleEnvironment } from "@/lib/paddle";

const TIER_LABEL: Record<PlanTier, string> = {
  expired: "Expired",
  starter: "Starter",
  pro: "Pro",
  trial_pro: "Free trial (Pro features)",
  business: "Business",
};

const PLANS = [
  { id: "starter_monthly" as const, name: "Starter", price: 29, tier: "starter" as PlanTier },
  { id: "pro_monthly" as const, name: "Pro", price: 59, tier: "pro" as PlanTier },
  { id: "business_monthly" as const, name: "Business", price: 89, tier: "business" as PlanTier },
];

export function BillingPanel() {
  const { data: plan, isLoading } = useSubscription();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const qc = useQueryClient();

  const portalFn = useServerFn(createPortalSession);
  const cancelFn = useServerFn(cancelSubscription);
  const simulateFn = useServerFn(simulateTrialExpiry);

  const portalMut = useMutation({
    mutationFn: () => portalFn({}),
    onSuccess: (res) => {
      window.open(res.overviewUrl, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to open portal"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelFn({}),
    onSuccess: () => {
      toast.success("Cancellation scheduled — access continues until period end");
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to cancel"),
  });

  const simulateMut = useMutation({
    mutationFn: () => simulateFn({}),
    onSuccess: () => {
      toast.success("Trial marked as expired");
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
  });

  if (isLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;

  const isTestMode = getPaddleEnvironment() === "sandbox";
  const hasActiveSub = plan && plan.tier !== "trial_pro" && plan.tier !== "expired";
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
              <CardDescription>Your SEZA POS subscription and billing details.</CardDescription>
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
          {isReadOnly && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              Your trial or subscription has ended. Choose a plan to restore full POS access.
            </div>
          )}
          {hasActiveSub && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => portalMut.mutate()} disabled={portalMut.isPending}>
                {portalMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                Manage billing & invoices
              </Button>
              {!plan?.cancelAtPeriodEnd && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Cancel plan? You'll keep access until the end of the current period.")) {
                      cancelMut.mutate();
                    }
                  }}
                  disabled={cancelMut.isPending}
                >
                  Cancel plan
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> {hasActiveSub ? "Change plan" : "Choose a plan"}
          </CardTitle>
          <CardDescription>
            Upgrades take effect immediately with prorated billing. Downgrades apply at the next billing cycle.
          </CardDescription>
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
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || checkoutLoading}
                  onClick={() => openCheckout(p.id)}
                >
                  {isCurrent ? "Current plan" : hasActiveSub ? "Switch to this plan" : "Choose"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isTestMode && (
        <Card className="border-orange-300 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="text-sm text-orange-900">Test-mode tools</CardTitle>
            <CardDescription className="text-orange-900/70">
              Only visible in the preview. Test card: <code>4242 4242 4242 4242</code>, any future expiry, CVC 123.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Separator className="my-2" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => simulateMut.mutate()}
              disabled={simulateMut.isPending}
            >
              Simulate trial expiry (read-only mode)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
