import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  changeStoreSubscriptionPlan,
  createSubscriptionCheckout,
} from "@/lib/billing/checkout.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { userFacingError } from "@/lib/errors/user-facing";

interface StripeCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceId: string;
  planName: string;
}

type ExistingSubscriptionState = {
  currentPlan: string;
  environment: "sandbox" | "live";
};

export function StripeCheckoutDialog({
  open,
  onOpenChange,
  priceId,
  planName,
}: StripeCheckoutDialogProps) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingSubscriptionState | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setExisting(null);
    setSwitching(false);

    void (async () => {
      try {
        const origin = window.location.origin;
        const result = await createSubscriptionCheckout({
          data: {
            priceId,
            successUrl: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: window.location.href,
          },
        });
        if (cancelled) return;
        if ("error" in result) throw new Error(result.error);
        if ("existing" in result && result.existing) {
          setExisting({
            currentPlan: result.currentPlan,
            environment: result.environment,
          });
          return;
        }
        if (!("url" in result) || !result.url) throw new Error("Stripe did not return a checkout URL");
        window.location.assign(result.url);
      } catch (err) {
        if (!cancelled) {
          setError(userFacingError(err, "Could not start checkout. Please try again."));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, priceId]);

  const switchPlan = async () => {
    try {
      setSwitching(true);
      setError(null);
      const result = await changeStoreSubscriptionPlan({ data: { priceId } });
      if ("error" in result) throw new Error(result.error);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription"] }),
        qc.invalidateQueries({ queryKey: ["billing-plan-usage"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["pos-devices"] }),
      ]);
      toast.success(`${planName} is active`);
      onOpenChange(false);
      window.location.assign(`${window.location.origin}/settings?section=billing&plan_changed=1`);
    } catch (err) {
      setError(userFacingError(err, "Could not change the subscription plan. Please try again."));
      setSwitching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? `Switch to ${planName}` : `Choose ${planName}`}</DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : existing ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <div className="font-medium">Change this store to {planName}?</div>
              <div className="mt-1 text-muted-foreground">
                SEZA will update the existing Stripe {existing.environment === "sandbox" ? "test " : ""}
                subscription in place. No second subscription will be created.
              </div>
            </div>
            <Button className="w-full" onClick={switchPlan} disabled={switching}>
              {switching && <Loader2 className="mr-2 size-4 animate-spin" />}
              {switching ? `Switching to ${planName}…` : `Switch to ${planName}`}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
              disabled={switching}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="size-7 animate-spin text-primary" />
            <div className="font-medium">Checking your {planName} plan…</div>
            <div className="text-sm text-muted-foreground">
              Existing subscriptions are changed in place. New subscriptions open secure Stripe test checkout.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
