import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LockKeyhole, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePlanGate } from "@/hooks/useSubscription";
import { SEZA_FEATURE_MIN_TIER, SEZA_PLAN_BY_ID, type SezaFeatureKey } from "@/lib/plans";

export function PlanFeatureGate({
  feature,
  label,
  children,
}: {
  feature: SezaFeatureKey;
  label: string;
  children: ReactNode;
}) {
  const gate = usePlanGate();

  if (gate.isLoading) {
    return <div className="min-h-32 animate-pulse rounded-xl border bg-muted/20" />;
  }

  if (gate.canFeature(feature)) return <>{children}</>;

  const required = SEZA_FEATURE_MIN_TIER[feature];
  const plan = SEZA_PLAN_BY_ID[required];
  return (
    <Card className="max-w-2xl border-primary/25 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="size-5 text-primary" /> {label}
        </CardTitle>
        <CardDescription>
          {gate.isReadOnly
            ? "Your trial or subscription is not active. Choose a plan to continue using SEZA."
            : `${label} is included with ${plan.name} and higher.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link to="/settings" search={{ section: "billing" } as any}>
            <Sparkles className="mr-2 size-4" />
            {gate.isReadOnly ? "Choose a plan" : `Upgrade to ${plan.name}`}
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">
          Current plan: {gate.definition?.name ?? "No active plan"}
        </span>
      </CardContent>
    </Card>
  );
}
