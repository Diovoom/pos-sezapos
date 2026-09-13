import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { createStripePayoutSession } from "@/lib/stripe-connect.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Bootstrap = {
  publishableKey: string;
  clientSecret: string;
};

export function StripePayoutsManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createPayoutSession = useServerFn(createStripePayoutSession);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const firstClientSecretRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBootstrap(null);
      firstClientSecretRef.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);
    void createPayoutSession({})
      .then((result) => {
        if (cancelled) return;
        firstClientSecretRef.current = result.clientSecret;
        setBootstrap({
          publishableKey: result.publishableKey,
          clientSecret: result.clientSecret,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(userFacingError(error, "Could not open payout management."));
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createPayoutSession, onOpenChange, open]);

  const fetchClientSecret = useCallback(async () => {
    const first = firstClientSecretRef.current;
    if (first) {
      firstClientSecretRef.current = null;
      return first;
    }
    const next = await createPayoutSession({});
    return next.clientSecret;
  }, [createPayoutSession]);

  const connectInstance = useMemo(() => {
    if (!bootstrap?.publishableKey) return null;
    return loadConnectAndInitialize({
      publishableKey: bootstrap.publishableKey,
      fetchClientSecret,
    });
  }, [bootstrap?.publishableKey, fetchClientSecret]);

  useEffect(() => {
    const target = mountRef.current;
    if (!open || !target || !connectInstance) return;

    const accountManagement = connectInstance.create("account-management");
    target.replaceChildren(accountManagement);

    return () => {
      accountManagement.remove();
      target.replaceChildren();
    };
  }, [connectInstance, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Manage payout account</DialogTitle>
          <DialogDescription>
            Securely review or change the bank account Stripe uses for this store's deposits.
          </DialogDescription>
        </DialogHeader>

        {loading && !bootstrap ? (
          <div className="flex min-h-72 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Opening secure Stripe account management…
          </div>
        ) : (
          <div ref={mountRef} className="min-h-[560px] bg-background p-4 sm:p-6" />
        )}
      </DialogContent>
    </Dialog>
  );
}
