import { Link } from "@tanstack/react-router";
import { AlertCircle, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";

export function TrialCountdown() {
  const { data: plan } = useSubscription();
  if (!plan) return null;

  if (plan.isReadOnly) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <div className="font-medium text-sm">Read-only mode</div>
            <div className="text-xs text-muted-foreground">
              Your trial or subscription has ended. Choose a plan to keep ringing sales.
            </div>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/settings" search={{ section: "billing" } as any}>
            Choose plan
          </Link>
        </Button>
      </div>
    );
  }

  if (plan.isTrialing && plan.daysLeft != null) {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium text-sm">
              {plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"} left in your free trial
            </div>
            <div className="text-xs text-muted-foreground">
              Full Pro features unlocked. Pick a plan any time to keep going.
            </div>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/settings" search={{ section: "billing" } as any}>
            View plans
          </Link>
        </Button>
      </div>
    );
  }

  if (plan.cancelAtPeriodEnd && plan.periodEnd) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-700" />
          <div>
            <div className="font-medium text-sm">Cancellation scheduled</div>
            <div className="text-xs text-amber-900/70">
              Access ends {plan.periodEnd.toLocaleDateString()}.
            </div>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/settings" search={{ section: "billing" } as any}>
            Manage
          </Link>
        </Button>
      </div>
    );
  }

  if (plan.status === "past_due") {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <div className="font-medium text-sm">Payment failed</div>
            <div className="text-xs text-muted-foreground">
              We're retrying. Update your card to avoid interruption.
            </div>
          </div>
        </div>
        <Button asChild size="sm" variant="destructive">
          <Link to="/settings" search={{ section: "billing" } as any}>
            Update card
          </Link>
        </Button>
      </div>
    );
  }

  return null;
}
