import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createSubscriptionCheckout } from "@/lib/billing/checkout.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StripeCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceId: string;
  planName: string;
}

export function StripeCheckoutDialog({
  open,
  onOpenChange,
  priceId,
  planName,
}: StripeCheckoutDialogProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

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
        if (!result.url) throw new Error("Stripe did not return a checkout URL");
        window.location.assign(result.url);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start Stripe test checkout");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, priceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subscribe to {planName}</DialogTitle>
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
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="size-7 animate-spin text-primary" />
            <div className="font-medium">Opening secure Stripe test checkout…</div>
            <div className="text-sm text-muted-foreground">
              Test mode only — no real card will be charged.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
