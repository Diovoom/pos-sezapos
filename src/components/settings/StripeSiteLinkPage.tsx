import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStripeEmbeddedSession, type StripeEmbeddedView } from "@/lib/stripe-connect.functions";
import { userFacingError } from "@/lib/errors/user-facing";

const CONNECT_JS_URL = "https://connect-js.stripe.com/v1.0/connect.js";

type StripeConnectInstance = {
  create: (component: string) => HTMLElement;
};

type StripeConnectGlobal = {
  init?: (options: {
    publishableKey: string;
    fetchClientSecret: () => Promise<string>;
  }) => StripeConnectInstance;
  onLoad?: () => void;
};

declare global {
  interface Window {
    StripeConnect?: StripeConnectGlobal;
  }
}

let connectLoaderPromise: Promise<Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal> | null = null;

function loadStripeConnect() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Stripe account tools can only load in the browser."));
  }

  if (typeof window.StripeConnect?.init === "function") {
    return Promise.resolve(window.StripeConnect as Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal);
  }

  if (connectLoaderPromise) return connectLoaderPromise;

  connectLoaderPromise = new Promise<Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal>((resolve, reject) => {
    const global = (window.StripeConnect ??= {});
    const previousOnLoad = global.onLoad;
    const finish = () => {
      previousOnLoad?.();
      if (typeof window.StripeConnect?.init !== "function") {
        reject(new Error("Stripe Connect loaded without its initialization API."));
        return;
      }
      resolve(window.StripeConnect as Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal);
    };

    global.onLoad = finish;

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CONNECT_JS_URL}"]`);
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("Could not load Stripe Connect.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CONNECT_JS_URL;
    script.async = true;
    script.addEventListener("error", () => reject(new Error("Could not load Stripe Connect.")), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    connectLoaderPromise = null;
    throw error;
  });

  return connectLoaderPromise;
}

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

export function StripeSiteLinkPage({
  view,
  autoOpen = false,
}: {
  view: StripeEmbeddedView;
  autoOpen?: boolean;
}) {
  const createSession = useServerFn(createStripeEmbeddedSession);
  const [bootstrap, setBootstrap] = useState<{ publishableKey: string; clientSecret: string } | null>(null);
  const [started, setStarted] = useState(autoOpen);
  const [error, setError] = useState<string | null>(null);
  const firstClientSecretRef = useRef<string | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const info = LABELS[view];

  useEffect(() => {
    setStarted(autoOpen);
  }, [autoOpen, view]);

  useEffect(() => {
    let cancelled = false;
    setBootstrap(null);
    setError(null);
    firstClientSecretRef.current = null;

    // Stripe requires every live Site-link URL to be saved before it allows
    // AccountSession creation. Do not create a session just because Stripe or
    // the merchant opens this URL for validation; render a real SEZA landing
    // page first, then create the secure component after explicit open (or when
    // Stripe sends a real email redirect with stripe_account_id).
    if (!started) return () => { cancelled = true; };

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
  }, [createSession, started, view]);

  const fetchClientSecret = useCallback(async () => {
    const first = firstClientSecretRef.current;
    if (first) {
      firstClientSecretRef.current = null;
      return first;
    }
    const next = await createSession({ data: { view } });
    return next.clientSecret;
  }, [createSession, view]);

  useEffect(() => {
    const target = mountRef.current;
    if (!target || !bootstrap?.publishableKey) return;

    let cancelled = false;
    let embedded: HTMLElement | null = null;

    void loadStripeConnect()
      .then((StripeConnect) => {
        if (cancelled) return;
        const connectInstance = StripeConnect.init({
          publishableKey: bootstrap.publishableKey,
          fetchClientSecret,
        });
        embedded = connectInstance.create(info.component);
        target.replaceChildren(embedded);
      })
      .catch((cause) => {
        if (!cancelled) setError(userFacingError(cause, "Could not load Stripe account tools."));
      });

    return () => {
      cancelled = true;
      embedded?.remove();
      target.replaceChildren();
    };
  }, [bootstrap?.publishableKey, fetchClientSecret, info.component]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold">{info.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
      </div>

      {!started ? (
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">
            This is the SEZA destination for Stripe {info.title.toLowerCase()}.
            Your store must be signed in before sensitive Stripe information is shown.
          </div>
          <Button className="mt-4" onClick={() => setStarted(true)}>
            Open secure {info.title}
          </Button>
        </div>
      ) : error ? (
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
