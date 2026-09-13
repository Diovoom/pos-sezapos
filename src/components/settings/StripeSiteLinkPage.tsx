import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2 } from "lucide-react";
import { createStripeEmbeddedSession, type StripeEmbeddedView } from "@/lib/stripe-connect.functions";
import { userFacingError } from "@/lib/errors/user-facing";

const LABELS: Record<StripeEmbeddedView, { title: string; description: string; component: string }> = {
  "account-management": {
    title: "Stripe account management",
    description: "Review business information and the bank account used for payouts.",
    component: "account-management",
  },
  "notification-banner": {
    title: "Stripe account notifications",
    description: "Review any Stripe verification, risk, or account actions that need attention.",
    component: "notification-banner",
  },
  payments: {
    title: "Stripe payments",
    description: "Review processed card payments, refunds, and disputes for this store.",
    component: "payments",
  },
  payouts: {
    title: "Stripe payouts",
    description: "Review payout history and payout activity for this store.",
    component: "payouts",
  },
  balances: {
    title: "Stripe balance",
    description: "Review the Stripe balance and upcoming payout information for this store.",
    component: "balances",
  },
  documents: {
    title: "Stripe documents",
    description: "Review Stripe documents available to this store.",
    component: "documents",
  },
};

export function StripeSiteLinkPage({ view }: { view: StripeEmbeddedView }) {
  const createSession = useServerFn(createStripeEmbeddedSession);
  const [bootstrap, setBootstrap] = useState<{ publishableKey: string; clientSecret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstClientSecretRef = useRef<string | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const info = LABELS[view];

  useEffect(() => {
    let cancelled = false;
    setBootstrap(null);
    setError(null);
    firstClientSecretRef.current = null;

    void createSession({ data: { view } })
      .then((result) => {
        if (cancelled) return;
        firstClientSecretRef.current = result.clientSecret;
        setBootstrap({ publishableKey: result.publishableKey, clientSecret: result.clientSecret });
      })
      .catch((cause) => {
        if (!cancelled) setError(userFacingError(cause, "Could not open this Stripe account page."));
      });

    return () => {
      cancelled = true;
    };
  }, [createSession, view]);

  const fetchClientSecret = useCallback(async () => {
    const first = firstClientSecretRef.current;
    if (first) {
      firstClientSecretRef.current = null;
      return first;
    }
    const next = await createSession({ data: { view } });
    return next.clientSecret;
  }, [createSession, view]);

  const connectInstance = useMemo(() => {
    if (!bootstrap?.publishableKey) return null;
    return loadConnectAndInitialize({
      publishableKey: bootstrap.publishableKey,
      fetchClientSecret,
    });
  }, [bootstrap?.publishableKey, fetchClientSecret]);

  useEffect(() => {
    const target = mountRef.current;
    if (!target || !connectInstance) return;

    const embedded = connectInstance.create(info.component as any);
    target.replaceChildren(embedded);

    return () => {
      embedded.remove();
      target.replaceChildren();
    };
  }, [connectInstance, info.component]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold">{info.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
      </div>

      {error ? (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-medium">Stripe setup is not ready yet</div>
            <div className="mt-1">{error}</div>
          </div>
        </div>
      ) : !bootstrap ? (
        <div className="flex min-h-72 items-center justify-center gap-2 rounded-xl border bg-card p-8 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Opening secure Stripe account tools…
        </div>
      ) : (
        <div ref={mountRef} className="min-h-[560px] rounded-xl border bg-background p-3 sm:p-5" />
      )}
    </div>
  );
}
