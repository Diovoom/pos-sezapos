import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { format } from "date-fns";
import { Loader2, CreditCard, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, type PlanTier } from "@/hooks/useSubscription";
import { StripeCheckoutDialog } from "@/components/billing/StripeCheckoutDialog";
import { createBillingPortalSession } from "@/lib/billing/checkout.functions";
import { SEZA_PLANS, formatPlanLimit, planForTier } from "@/lib/plans";
import { useMe } from "@/hooks/useMe";
import { supabase } from "@/integrations/supabase/client";

const TIER_LABEL: Record<PlanTier, string> = {
  expired: "Expired",
  starter: "Starter",
  pro: "Pro",
  trial_pro: "Free trial (Pro features)",
  business: "Business",
};

export function BillingPanel() {
  const { data: plan, isLoading } = useSubscription();
  const me = useMe();
  const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;
  const [checkout, setCheckout] = useState<{ priceId: string; name: string } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const usageQ = useQuery({
    queryKey: ["billing-plan-usage", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [profilesRes, ownersRes, devicesRes] = await Promise.all([
        (supabase.from as any)("profiles")
          .select("id")
          .eq("store_id", storeId!)
          .eq("status", "active"),
        (supabase.from as any)("user_roles")
          .select("user_id")
          .eq("store_id", storeId!)
          .eq("role", "owner"),
        (supabase.from as any)("device_registrations")
          .select("id")
          .eq("store_id", storeId!)
          .eq("status", "active"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (ownersRes.error) throw ownersRes.error;
      if (devicesRes.error) throw devicesRes.error;
      const ownerIds = new Set((ownersRes.data ?? []).map((row: any) => row.user_id));
      return {
        employees: (profilesRes.data ?? []).filter((row: any) => !ownerIds.has(row.id)).length,
        registers: (devicesRes.data ?? []).length,
      };
    },
    staleTime: 15_000,
  });

  const openCheckout = (priceId: string, name: string) => {
    setCheckout({ priceId, name });
  };

  const openPortal = async () => {
    try {
      setPortalLoading(true);
      const result = await createBillingPortalSession({
        data: {
          returnUrl: `${window.location.origin}/settings`,
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(userFacingError(err, "Could not open the billing portal"));
    } finally {
      setPortalLoading(false);
    }
  };



  if (isLoading)
    return (
      <div className="p-6">
        <Loader2 className="animate-spin" />
      </div>
    );

  const isTrialing = plan?.isTrialing;
  const isReadOnly = plan?.isReadOnly;
  const hasPaidPlan = Boolean(
    plan?.tier && plan.tier !== "trial_pro" && plan.tier !== "expired",
  );

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
                {TIER_LABEL[(plan?.tier ?? "expired") as PlanTier]}
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
              {plan.daysLeft != null &&
                `  -  ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left`}
            </div>
          )}

          {hasPaidPlan && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Manage subscription
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {planForTier(plan?.tier) && (
        <Card>
          <CardHeader>
            <CardTitle>What your plan includes</CardTitle>
            <CardDescription>
              SEZA enforces these limits automatically so the product matches the plan you pay for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {(() => {
              const definition = planForTier(plan?.tier)!;
              const usage = usageQ.data ?? { employees: 0, registers: 0 };
              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground">Employees</div>
                      <div className="mt-1 text-2xl font-bold">
                        {usage.employees} / {formatPlanLimit(definition.limits.employees)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground">POS registers</div>
                      <div className="mt-1 text-2xl font-bold">
                        {usage.registers} / {formatPlanLimit(definition.limits.registers)}
                      </div>
                    </div>
                  </div>
                  <ul className="grid gap-2 text-sm md:grid-cols-2">
                    {definition.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan?.tier === "trial_pro" && (
                    <p className="text-xs text-muted-foreground">
                      Your 14-day trial uses Pro features and Pro limits. Choose a paid plan before the trial ends to keep access.
                    </p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{hasPaidPlan ? "Change plan" : "Choose a plan"}</CardTitle>
          <CardDescription>
            {hasPaidPlan
              ? "Switch plans here. Stripe keeps the existing subscription and applies any applicable proration; payment method, invoices, and cancellation remain in the secure billing portal."
              : "Subscribe to keep using SEZA POS after your trial ends."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {SEZA_PLANS.map((p) => {
            const isCurrent = plan?.tier === p.id;
            return (
              <div
                key={p.id}
                className={`rounded-lg border p-4 ${isCurrent ? "border-primary" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  {isCurrent && <Badge variant="outline">Current</Badge>}
                </div>
                <div className="mt-2 text-2xl font-bold">
                  ${p.monthlyPrice}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </div>
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent}
                  onClick={() => openCheckout(p.lookupKey, p.name)}
                >
                  {isCurrent ? "Current plan" : hasPaidPlan ? "Switch plan" : "Choose plan"}
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
